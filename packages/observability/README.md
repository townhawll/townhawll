# Observability

`@townhawll/observability` provides JSON Pino logging, request-ID helpers, and
Sentry event redaction. Logs go to stdout; the deployment platform collects
them.

Create a logger per server runtime (`web`, `admin`, or a future worker). Add a
validated request ID to a child logger for request-scoped events. Use static
event names and messages. Never interpolate credentials, tokens, user input,
request bodies, or provider payloads into log messages.

Known sensitive fields are redacted recursively, and logged errors retain only
their type. Sentry keeps safe exception type and stack location while dropping
request data, user details, breadcrumbs, and exception messages. This is a
privacy baseline, not permission to log sensitive objects deliberately.
