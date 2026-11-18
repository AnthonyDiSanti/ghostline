package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/aws/aws-sdk-go-v2/service/ssm/types"
)

type fakeParameters struct {
	calls int
	read func(int) (*ssm.GetParametersOutput, error)
}

func (fake *fakeParameters) GetParameters(_ context.Context, input *ssm.GetParametersInput, _ ...func(*ssm.Options)) (*ssm.GetParametersOutput, error) {
	// Exercise the production retrieval contract through its real SDK-shaped boundary.
	if !aws.ToBool(input.WithDecryption) || len(input.Names) != 2 {
		return nil, errors.New("unexpected request")
	}
	fake.calls++
	return fake.read(fake.calls)
}

func selectedParameters() map[string]string {
	// Every value is disposable test material, never a production ARN or credential.
	return map[string]string{"xray": "arn:aws:ssm:eu-north-1:111111111111:parameter/ghostline/prod/server/xray",
		"awg": "arn:aws:ssm:eu-north-1:111111111111:parameter/ghostline/prod/server/awg"}
}

func parameterResponse() *ssm.GetParametersOutput {
	// Return the opposite map order; the loader must join exact ARNs rather than positions.
	result := &ssm.GetParametersOutput{}
	for _, name := range []string{"awg", "xray"} {
		result.Parameters = append(result.Parameters, types.Parameter{ARN: aws.String(selectedParameters()[name]),
			Type: types.ParameterTypeSecureString, Version: 3, Value: aws.String("synthetic-" + name)})
	}
	return result
}

func TestParameterSelection(t *testing.T) {
	// Exact same-region/server-only authority excludes client paths and mixed namespaces/accounts.
	valid := `{"xray":"arn:aws:ssm:eu-north-1:111111111111:parameter/ghostline/prod/server/xray","awg":"arn:aws:ssm:eu-north-1:111111111111:parameter/ghostline/prod/server/awg"}`
	if names, region, err := parameters(valid); err != nil || len(names) != 2 || region != "eu-north-1" {
		t.Fatal("valid selection rejected")
	}
	for _, invalid := range []string{valid + `{}`, strings.Replace(valid, "/server/xray", "/clients/macos/xray", 1),
		strings.Replace(valid, "111111111111", "222222222222", 1), strings.Replace(valid, "eu-north-1", "us-west-2", 1)} {
		if _, _, err := parameters(invalid); err == nil {
			t.Fatal("unsafe selection accepted")
		}
	}
}

func TestStableCompleteRetrieval(t *testing.T) {
	// Publication can begin only after two consistent complete reads.
	fake := &fakeParameters{read: func(int) (*ssm.GetParametersOutput, error) { return parameterResponse(), nil }}
	values, err := retrieve(context.Background(), fake, selectedParameters())
	if err != nil || fake.calls != 2 || values["xray"] != "synthetic-xray" || values["awg"] != "synthetic-awg" {
		t.Fatal("stable retrieval failed")
	}
}

func TestIncompleteUnstableAndSecretErrors(t *testing.T) {
	// API, metadata and version failures must neither return a partial set nor expose upstream details.
	for _, failure := range []string{"missing", "duplicate", "version", "type", "changed-value", "sdk"} {
		t.Run(failure, func(t *testing.T) {
			fake := &fakeParameters{read: func(call int) (*ssm.GetParametersOutput, error) {
				result := parameterResponse()
				switch failure {
				case "missing": result.Parameters = result.Parameters[:1]
				case "duplicate": result.Parameters[1] = result.Parameters[0]
				case "version": if call == 2 { result.Parameters[0].Version++ }
				case "type": result.Parameters[0].Type = types.ParameterTypeString
				case "changed-value": if call == 2 { result.Parameters[0].Value = aws.String("synthetic-secret-error") }
				case "sdk": return nil, errors.New("synthetic-secret-error")
				}
				return result, nil
			}}
			values, err := retrieve(context.Background(), fake, selectedParameters())
			if err == nil || values != nil || strings.Contains(err.Error(), "synthetic") {
				t.Fatal("failure returned data or unsafe diagnostics")
			}
		})
	}
}
