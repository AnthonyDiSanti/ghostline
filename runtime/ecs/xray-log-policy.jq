# Logging is runtime policy; imported credential bundles cannot re-enable traffic diagnostics.
def quiet_stream:
  if (.streamSettings.realitySettings? | type) == "object"
  then .streamSettings.realitySettings.show = false else . end;

.log = {access: "none", error: "none", loglevel: "none", dnsLog: false}
| if (.inbounds | type) == "array" then .inbounds |= map(quiet_stream) else . end
| if (.outbounds | type) == "array" then .outbounds |= map(quiet_stream) else . end
