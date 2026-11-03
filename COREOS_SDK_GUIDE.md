# CORE OS — Guide SDK

Le client canonique minimal est `sdk/coreos-client.js`. Il gère bearer auth, correlation IDs, idempotency keys, JSON, erreurs typées et retry uniquement sur GET/5xx.

```js
import { CoreOSClient } from './sdk/coreos-client.js';
const core = new CoreOSClient({ baseUrl: process.env.COREOS_URL, token: process.env.COREOS_TOKEN });
const version = await core.version();
const planned = await core.submit(request, { idempotencyKey: 'my-operation-001' });
const evidence = await core.evidence(planned.execution_id);
```

Qualification RC5 : 12/12, incluant version/contract, enregistrement et découverte de 3 adapters, submit, plan, evidence et receipt.
