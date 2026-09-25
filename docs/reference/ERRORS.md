# Errors and recovery

`AdapterError` extends `Error` and exposes `code`, optional `status`, `requestId`,
and `attempts`. `toJSON()` and `publicError(error)` return safe structured details.
Unknown exceptions become a generic message, not a copied stack/body. Custom
providers deliberately constructing `AdapterError` must keep its message safe.

| Code | Meaning and response |
| --- | --- |
| `CONFIGURATION_ERROR` | Invalid/unknown option, missing credential, incompatible provider setting, or invalid endpoint; fix configuration |
| `VALIDATION_ERROR` | Invalid request/template/JSON; fix input before retrying |
| `USAGE_ERROR` | Invalid CLI flags/arguments or stdin usage; consult help |
| `IO_ERROR` | Input/output path or permissions failure; preserve previous output |
| `INPUT_TOO_LARGE` | CLI byte limit exceeded; reduce or split input |
| `REQUEST_TOO_LARGE` | Encoded provider request exceeds configured limit; reduce input/schema |
| `RESPONSE_TOO_LARGE` | Provider response exceeds configured limit; inspect budget/model behavior |
| `HTTP_ERROR` | Non-success HTTP response; use status/request ID, not raw error body |
| `NETWORK_ERROR` | Transport failed ambiguously; no automatic network retry occurred |
| `RETRY_BUDGET_EXCEEDED` | Server delay cannot fit remaining deadline; choose a later attempt explicitly |
| `TIMEOUT` | Provider, adapter, preparation, or listing deadline exceeded |
| `ABORTED` | Caller cancelled; remote work might already have been billed |
| `INVALID_RESPONSE` | Wrong envelope, invalid UTF-8/JSON/schema/distribution/usage; do not trust partial answers |
| `MODEL_REFUSAL` | Provider explicitly declined the evaluation; no fabricated result |
| `TRUNCATED_OUTPUT` | Output/context budget exhausted; revise budget/input explicitly |
| `EXTENSION_ERROR` | Preparation failed; inference was not issued after that failure |
| `PROVIDER_ERROR` | Sanitized custom-provider exception |
| `UNSUPPORTED_OPERATION` | Provider does not implement listing or another requested operation |
| `BATCH_SKIPPED` | SDK stop-on-error prevented a not-yet-started record |
| `UNEXPECTED_ERROR` | Unrecognized error sanitized for public output |

## Retry policy

The shared HTTP transport retries **429, 502, 503, 504, and 529** only. `maxRetries`
means additional attempts; the default 2 allows at most 3 total attempts. All
attempts, backoff, and response-body reading share one timeout budget.

`Retry-After` seconds or HTTP dates are honored. Without it, exponential backoff
starts at 250 ms with jitter and an 8-second base cap. A delay that cannot fit the
remaining budget fails instead of violating the server's requested wait.

Authentication failures, generic HTTP 500, invalid output, model refusal, and
ambiguous network failures are not retried automatically. HTTP retries are not an
exactly-once billing guarantee. Set `maxRetries: 0` when your workflow requires
manual retry decisions. The adapter never retries a successful request because an
observer failed; inspect `meta.observerFailures` separately.

## Practical diagnosis

401/403 usually requires checking key/account/model authorization with the provider;
the client reports the actual status rather than claiming to diagnose account
state. 404 can indicate an incorrect API base/model/route. 429 exposes throttling;
repeated retries can increase load. For `INVALID_RESPONSE`, a schema-capable model
may still emit invalid probabilities or be routed through an incompatible endpoint.
Change configuration deliberately and retest; do not disable local validation.

Keep a request ID, adapter version, configured provider, requested/reported model,
and template revision for incident analysis. Log input or results only under your
own data-handling policy. No logging or telemetry is enabled by default.
