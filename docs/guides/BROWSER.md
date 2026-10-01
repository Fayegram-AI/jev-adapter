# Browser integration

The SDK exports browser-compatible ESM. Install `@fayegram-ai/jev-adapter` in a
browser application and import it through your application's module bundler. The
optional `jev-decision` command still requires Node.js.

Browser providers require an explicit `apiKey`; Node environment-variable
defaults and `.env` files are not available in browser code. For example, if
TypeSafe permits your application's origin and provides a credential suitable
for client exposure. In the example, `browserCredential` is supplied by your
application's credential flow:

```javascript
import { createAdapter, JevProvider, noul } from '@fayegram-ai/jev-adapter';

const adapter = createAdapter({
    provider: new JevProvider({ apiKey: browserCredential }),
});
const result = await adapter.evaluate({
    state: 'A user-supplied statement',
    questions: { relevant: noul('Is this relevant?') },
});
console.log(result.answers.relevant.noul);
```

This sends the request **directly from the browser**. The provider's server must
accept the page's origin in its CORS preflight response and allow the method and
headers used by the SDK. For Jev evaluation those include `POST`, `Authorization`,
and `Content-Type`. If the preflight is rejected, the browser sends no evaluation
request; neither the SDK nor a browser setting can override that server policy.
Check your intended origin with TypeSafe before relying on direct Jev calls.

Any key delivered to browser JavaScript can be read by the app's users. Only use
a credential that the provider explicitly permits for browser exposure. If an
account key must remain private, keep the provider call in your own backend and
invoke that backend from the browser. This is a credential boundary, separate
from whether the SDK's modules can run in a browser.
