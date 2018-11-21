

## Hooks

A hook is a registered function that is triggered when some event occurs.

There are few differences between a classical event (i.e.: the observer pattern) and a restQuery hook:

* only one hook can be registered by event (by collection for hooks on collection).
* a hook can modify or even interupt the main flow (the hook caller).
* all restQuery hook are async.
* the main flow is suspended, waiting for the hook completion.



Whatever the hook, they are always functions of the form: `function( hookContext )` returning a `Promise` that resolve once completed.

Inside a hook, the `this` context is always the current `restQuery.App` instance.



### App hooks

App hooks are executed when the restQuery app is at different stage of execution.

The hook is a function of the form: `function( hookContext )`, where:

* hookContext `Object` this object is currently empty

The current restQuery stage will wait for the `Promise`'s hook to resolve to continue, if it rejects the restQuery app will be aborted.



#### *init*

This hook is executed once, when restQuery is starting up, after the config is fully loaded, after any built-in initialization
are finished and just before restQuery starts accepting request.



### Document hooks

Document hooks are executed when a user issue a request on a document.

The hook is a function of the form: `function( hookContext )`, where:

* hookContext `Object` an object containing various information on the current request to be processed,
	see [*Common context*](#ref.common-context)

The request processing will wait for the `Promise`'s hook to resolve to continue, if it rejects the request will be aborted.



#### *beforeCreate*

When:

* a POST request creating a new document (not POST request executing a method)
* a PUT request creating a new document or overwriting a whole document
* executed before the document is inserted, if it rejects the document creation is aborted

The `context.incomingDocument` contains the document about to be created: it can be altered by the hook.

If `context.parentObjectNode` is set, then the resource about to be created is a child of that *objectNode*
(e.g. PUT, POST on a collection).

If `context.linkerObjectNode` is set, then the resource about to be created is linked by that *objectNode*
(e.g. PUT on a link).

If `context.objectNode` is set at this stage, then this is an *objectNode* about to be overwritten.

The same apply to `context.existingDocument` (the document about to be replaced).



#### *afterCreate*

When:

* a POST request creating a new document (not POST request executing a method)
* a PUT request creating a new document or overwriting a whole document
* executed after the document is inserted

The `context.document` contains the freshly created document.

The `context.objectNode` contains the freshly created *objectNode*.

If `context.deletedDocument` is set, this is the document that have been deleted (this is the same document
as `context.existingDocument` in the *beforeCreate* hook).

If `context.linkerObjectNode` is set, then the freshly created resource is linked by that *objectNode*
(e.g. PUT on a link).



#### *beforeModify*

When:

* a PATCH request on a document or a document part
* a PUT request on a subpart of a document (it's internally transformed into a PATCH request)
* executed before the document is modified, if it rejects the modification is aborted

The `context.incomingPatch` contains the patch about to be issued: it can be altered by the hook.

The `context.existingDocument` is always set, and contains the document that will be patched (before the patch).

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

The `context.existingDocument` is always set, and contains the document about to be deleted.

The `context.objectNode` contains the *objectNode* about to be deleted.



#### *afterDelete*

When:

* a DELETE request deleting a document
* executed after the document is deleted

The `context.deletedDocument` contains the removed document.

The `context.objectNode` contains the removed *objectNode*, it can be useful to retrieve some data, but it should not be used
to modify or traverse it (e.g. access its children).



### Specific Document hooks

Specific hooks are for special collections like `Users`.



#### *beforeCreateToken*

When:

* the createToken method is invoked on a user
* executed before the token is created, if it rejects the token creation is aborted

The `context.incomingDocument` contains the connection document: it can be altered by the hook.

**BETA**, not well specified yet.



#### *afterCreateToken*

When:

* the createToken method is invoked on a user
* executed after the token creation

The `context.document` contains the user for which the token is created.
The `context.token` contains the token.

**BETA**, not well specified yet.

