# Authentication / Authorization

Le RC utilise bearer HMAC app-scoped. Chaque token doit porter `app_id`, `scopes`, `exp`; les scopes sont vérifiés route par route. Ne jamais placer `COREOS_AUTH_SECRET` dans le dépôt.
