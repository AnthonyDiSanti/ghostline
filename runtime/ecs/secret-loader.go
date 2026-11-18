// Retrieve server identities inside the initializer; plaintext never enters ECS/Docker creation inputs.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials/endpointcreds"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/aws/aws-sdk-go-v2/service/ssm/types"
	"github.com/aws/smithy-go/logging"
)

type parameterAPI interface {
	GetParameters(context.Context, *ssm.GetParametersInput, ...func(*ssm.Options)) (*ssm.GetParametersOutput, error)
}

var parameterARN = regexp.MustCompile(`^arn:aws:ssm:([a-z]{2}(?:-[a-z]+)+-[0-9]+):([0-9]{12}):parameter(/ghostline/(?:prod|trial/[a-z0-9-]+)/server/)(xray|awg|derp)$`)
var credentialPath = regexp.MustCompile(`^/v2/credentials/[a-f0-9-]{36}$`)

func parameters(text string) (map[string]string, string, error) {
	// Public references are exact, same-account/same-region server ARNs; client/history/path reads are unavailable.
	var names map[string]string
	decoder := json.NewDecoder(strings.NewReader(text))
	if decoder.Decode(&names) != nil || decoder.Decode(new(any)) != io.EOF || len(names) < 2 || len(names) > 3 {
		return nil, "", errors.New("invalid parameter selection")
	}
	identity, region := "", ""
	for name, arn := range names {
		match := parameterARN.FindStringSubmatch(arn)
		if match == nil || name != match[4] {
			return nil, "", errors.New("invalid parameter selection")
		}
		current := strings.Join(match[1:4], ":")
		if identity != "" && identity != current {
			return nil, "", errors.New("mixed parameter selection")
		}
		identity, region = current, match[1]
	}
	if names["xray"] == "" || names["awg"] == "" {
		return nil, "", errors.New("incomplete parameter selection")
	}
	return names, region, nil
}

func retrieve(ctx context.Context, client parameterAPI, names map[string]string) (map[string]string, error) {
	// Read the whole set twice before publication; a concurrent edit must not produce a mixed credential generation.
	arns := make([]string, 0, len(names))
	byARN := make(map[string]string)
	for name, arn := range names {
		arns = append(arns, arn)
		byARN[arn] = name
	}
	sort.Strings(arns)
	var previous map[string]types.Parameter
	for attempt := 0; attempt < 2; attempt++ {
		response, err := client.GetParameters(ctx, &ssm.GetParametersInput{Names: arns, WithDecryption: aws.Bool(true)})
		if err != nil || response == nil || len(response.InvalidParameters) != 0 || len(response.Parameters) != len(names) {
			return nil, errors.New("parameter retrieval failed")
		}
		current := make(map[string]types.Parameter)
		for _, parameter := range response.Parameters {
			name := byARN[aws.ToString(parameter.ARN)]
			if name == "" || current[name].Value != nil || parameter.Type != types.ParameterTypeSecureString || parameter.Version < 1 ||
				parameter.Value == nil || len(*parameter.Value) == 0 || len(*parameter.Value) > 4096 || strings.ContainsRune(*parameter.Value, 0) {
				return nil, errors.New("invalid parameter response")
			}
			if previous != nil && (previous[name].Version != parameter.Version || aws.ToString(previous[name].Value) != *parameter.Value) {
				return nil, errors.New("parameter generation changed")
			}
			current[name] = parameter
		}
		previous = current
	}
	values := make(map[string]string)
	for name, parameter := range previous {
		values[name] = *parameter.Value
	}
	return values, nil
}

func checkRAM(directory string) error {
	// Refuse symlinks, disk fallback, swap and loose ownership before fetching any secret.
	info, err := os.Lstat(directory)
	var filesystem syscall.Statfs_t
	swaps, swapErr := os.ReadFile("/proc/swaps")
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 || os.Geteuid() != 65532 ||
		syscall.Statfs(directory, &filesystem) != nil || filesystem.Type != 0x01021994 ||
		swapErr != nil || len(strings.Fields(string(swaps))) != 5 {
		return errors.New("private RAM prerequisite failed")
	}
	if info.Sys().(*syscall.Stat_t).Uid != 65532 {
		return errors.New("private RAM prerequisite failed")
	}
	return nil
}

func clearConfiguration(directory string) error {
	// Preserve directory inodes already bound into waiting engines; remove only known private outputs.
	for protocol, names := range map[string][]string{"xray": {"server.json"}, "awg": {"awg0.conf"}, "derp": {"derper.json", "public.json"}} {
		patterns := []string{".pending.*"}
		if protocol == "derp" {
			patterns = append(patterns, "*.crt", "*.key")
		}
		for _, pattern := range patterns {
			matches, _ := filepath.Glob(filepath.Join(directory, protocol, pattern))
			for _, match := range matches {
				names = append(names, filepath.Base(match))
			}
		}
		for _, name := range names {
			if err := os.Remove(filepath.Join(directory, protocol, name)); err != nil && !errors.Is(err, os.ErrNotExist) {
				return errors.New("configuration cleanup failed")
			}
		}
	}
	return nil
}

func render(ctx context.Context, values map[string]string) error {
	// The renderer receives a private pipe, not argv, environment, Docker metadata or container stdout.
	data, err := json.Marshal(values)
	if err != nil {
		return errors.New("configuration encoding failed")
	}
	command := exec.CommandContext(ctx, "/usr/local/bin/ghostline-gateway-config")
	command.Stdin = bytes.NewReader(data)
	command.Stdout, command.Stderr = io.Discard, io.Discard
	command.Env = []string{"PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/nonexistent"}
	if command.Run() != nil {
		return errors.New("configuration rendering failed")
	}
	return nil
}

func run() (result error) {
	// Disable dumps before reading credentials; errors at this boundary are fixed and never carry SDK payloads.
	if len(os.Args) != 1 || syscall.Setrlimit(syscall.RLIMIT_CORE, &syscall.Rlimit{}) != nil || checkRAM("/config") != nil {
		return errors.New("initializer prerequisite failed")
	}
	if err := clearConfiguration("/config"); err != nil {
		return err
	}
	defer func() {
		if result != nil {
			_ = clearConfiguration("/config")
		}
	}()
	names, region, err := parameters(os.Getenv("GHOSTLINE_PARAMETERS"))
	if err != nil {
		return err
	}
	relative := os.Getenv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")
	if !credentialPath.MatchString(relative) {
		return errors.New("task credential endpoint unavailable")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	httpClient := &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect refused") }}
	// Use only ECS task credentials. Never consult host IMDS, environment keys or shared credential/config files.
	provider := endpointcreds.New("http://169.254.170.2"+relative, func(options *endpointcreds.Options) { options.HTTPClient = httpClient })
	client := ssm.NewFromConfig(aws.Config{Region: region, Credentials: aws.NewCredentialsCache(provider), HTTPClient: httpClient,
		RetryMaxAttempts: 3, Logger: logging.LoggerFunc(func(logging.Classification, string, ...interface{}) {})})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
	defer cancel()
	values, err := retrieve(ctx, client, names)
	if err != nil {
		return err
	}
	return render(ctx, values)
}

func main() {
	// One fixed failure signal reaches Docker/journald; no secret-bearing wrapped errors cross this boundary.
	if run() != nil {
		fmt.Fprintln(os.Stderr, "Configuration preparation failed; details withheld.")
		os.Exit(1)
	}
}
