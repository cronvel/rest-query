

## Hooks

A hook is a registered function that is triggered when some event occurs.

There are few differences between a classical event (i.e.: the observer pattern) and a Rest Query hook:

* only one hook can be registered by event (by collection for hooks on collection).
* a hook can modify or even interupt the main flow (the hook caller).
* all Rest Query hook are async
* the main flow is suspended, waiting for the hook completion.

Whatever the hook, they are always functions of the form: `function( context )` returning a `Promise` that resolve once completed.





### App hooks

App hooks are executed when the Rest Query app is at different stage of execution.

The hook is a function of the form: `function( appContext )`, `appContext` being an object, where:
* app `App` the running App instance

Note that `appContext` here **IS NOT** a [*Context*](#ref.context) instance, because there are for request to the service.

The current Rest Query stage will wait for the `Promise`'s hook to resolve to continue, if it rejects the Rest Query app will be aborted.



#### *init*

This hook is executed once, when Rest Query is starting up, after the config is fully loaded, after any built-in initialization
are finished and just before Rest Query starts accepting request.



#### *shutdown*

This hook is executed once, when Rest Query is shutting down, before the HTTP module shutdown.





### Document hooks

Document hooks are executed when a user issue a request on a document.

**NEW:** It is now possible to specify an array of hook in the schema, they will be called one after the other (in a serial fashion).
If one hook call `context.done()`, it will prevent default behavior as well has subsequent hooks.

There are two type of hooks, *normal* or *before* hooks and *after* hooks.
When a *normal* hook throw or reject, all the request is aborted, *after* hooks are run after the default behavior, and thus do not change the final
outcome of the request, if it throws or rejects, it does not change the HTTP status, but subsequent *after* hook will not run.

The hook is a function of the form: `function( context )`, where:

* context `Context` an object containing various information on the current request to be processed, see [*Context*](#ref.context)

The request processing will wait for the `Promise`'s hook to resolve to continue.



#### *beforeCreate*

When:

* a POST request creating a new document (not POST request executing a method)
* a PUT request creating a new document or overwriting a whole document
* executed before the document is inserted, if it rejects the document creation is aborted

The `context.hook.incomingDocument` contains the document about to be created: it can be altered by the hook.

The `context.hook.existingDocument` contains the document about to be replaced, it is only set for PUT request overwriting an existing document.

The `context.parentObjectNode` is the parent *objectNode* of the resource about to be created (e.g. PUT, POST on a collection).

The `context.objectNode` is more contextual, for PUT overwriting a document, it is the existing *objectNode* about to be overwritten,
for POST or PUT creating a new document, this is the same than `context.parentObjectNode`.
In fact `context.objectNode` is always the last existing *objectNode* during the URL traversal.
It is often recommended not to use `context.objectNode` which is more for Rest Query internal stuff.

If `context.linkerObjectNode` is set, then the resource about to be created is linked by that *objectNode* (e.g. PUT on a link).



#### *afterCreate*

When:

* a POST request creating a new document (not POST request executing a method)
* a PUT request creating a new document or overwriting a whole document
* executed after the document is inserted

The `context.document` contains the freshly created document.

The `context.objectNode` contains the freshly created *objectNode*.

If `context.hook.deletedDocument` is set, this is the document that have been deleted (this is the same document
as `context.hook.existingDocument` in the *beforeCreate* hook).

If `context.linkerObjectNode` is set, then the freshly created resource is linked by that *objectNode*
(e.g. PUT on a link).



#### *beforeModify*

When:

* a PATCH request on a document or a document part
* a PUT request on a subpart of a document (it's internally transformed into a PATCH request)
* executed before the document is modified, if it rejects the modification is aborted

The `context.hook.incomingPatch` contains the patch about to be issued: it can be altered by the hook.

The `context.hook.existingDocument` is always set, and contains the document that will be patched (before the patch).

The `context.objectNode` contains the *objectNode* about to be patched.



#### *afterModify*

When:

* a PATCH request on a document or a document part
* a PUT request on a subpart of a document (it's internally transformed into a PATCH request)
* executed after the document is patched

The `context.document` contains the document in its final state (after the patch is applied).

The `context.objectNode` contains the patched *objectNode*.



#### *beforeDelete*

When:

* a DELETE request deleting a document
* executed before the document is modified, if it rejects the document will not be deleted

The `context.hook.existingDocument` is always set, and contains the document about to be deleted.

The `context.objectNode` contains the *objectNode* about to be deleted.



#### *afterDelete*

When:

* a DELETE request deleting a document
* executed after the document is deleted

The `context.hook.deletedDocument` contains the removed document.

The `context.objectNode` contains the removed *objectNode*, it can be useful to retrieve some data, but it should not be used
to modify or traverse it (e.g. access its children).



#### *search*

When:

* a GET request on a Collection with a 'search' parameter in query string
* executed after checking the 'filter' parameter of the query string
* executed before checking for text index, the hook may rewrite the 'filter' or 'search' parameters

The `context.input.query.search` contains the text search.
The `context.input.query.filter` contains the already checked and fixed filters.

If `context.input.query.search` is removed, the default search behavior is prevented, so it is possible to replace that
by custom **CORRECT** query filter (those new filters will not be checked/fixed by Rest Query).





### Document hooks for specific Collections

Specific hooks are for special collections like `Users`.



#### *beforeCreateToken*

For documents of collection: Users.

When:

* the createToken method is invoked on a user
* executed before the token creation, if it rejects the token creation is aborted

The `context.hook.incomingDocument` contains the connection document: it can be altered by the hook.

**BETA**, not well specified yet.



#### *afterCreateToken*

For documents of collection: Users.

When:

* the createToken method is invoked on a user
* executed after the token creation

The `context.document` contains the user for which the token is created.
The `context.hook.token` contains the token.

**BETA**, not well specified yet.



#### *beforeRegenerateToken*

For documents of collection: Users.

When:

* the regenerateToken method is invoked on a user
* executed before the new token creation, if it rejects the new token creation is aborted

**BETA**, not well specified yet.



#### *afterRegenerateToken*

For documents of collection: Users.

When:

* the regenerateToken method is invoked on a user
* executed after the token creation

The `context.document` contains the user for which a new token is created.
The `context.hook.token` contains the token.

**BETA**, not well specified yet.



#### *beforeCreateApiKey*

For documents of collection: Users.

When:

* the createApiKey method is invoked on a user
* executed before the API key creation, if it rejects the token creation is aborted

The `context.hook.incomingDocument` contains the incoming document: it can be altered by the hook.

**BETA**, not well specified yet.



#### *afterCreateApiKey*

For documents of collection: Users.

When:

* the createApiKey method is invoked on a user
* executed after the API key creation

The `context.document` contains the user for which the API key is created.
The `context.hook.apiKey` contains the API key.

**BETA**, not well specified yet.

