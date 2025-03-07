
## FAQ

### REST API

Q: A filter value passed through a query string is casted to the wrong type.

A: At low-level, query string values are casted to number when they match a number regexp.
   It can be casted back with a sanitizer on the document's schema, e.g.: `sanitize: toString`.

