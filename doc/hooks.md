

## Hooks

A hook is a registered function that is triggered when some event occurs.

There are few differences between a classical event (i.e.: the observer pattern) and a restQuery hook:

* only one hook can be registered by event (by collection for hooks on collection).
* a hook can modify or even interupt the main flow (the hook caller).
* all restQuery hook are async.
* the main flow is suspended, waiting for the hook completion.



Whatever the hook, they are always functions of the form: `function( hookContext , callback )`.

Inside a hook, the `this` context is always the current `restQuery.App` instance.



### App hooks

App hooks are executed when the restQuery app is at different stage of execution.

The hook is a function of the form: `function( hookContext , callback )`, where:

* hookContext `Object` this object is currently empty

* callback `Function(error)` this is the completion callback, the current restQuery stage will wait for the hook to trigger
	its callback to continue, however if the hook call its callback with an error, the restQuery app will be aborted.



#### *init*

This hook is executed once, when restQuery is starting up, after the config is fully loaded, after any built-in initialization
are finished and just before restQuery starts accepting request.



### Document hooks

Document hooks are executed when a user issue a request on a document.

The hook is a function of the form: `function( hookContext , callback )`, where:

* hookContext `Object` an object containing various information on the current request to be processed,
	see (*Common context*)[#ref.common-context]

* callback `Function(error)` this is the completion callback, the request processing will wait for the hook to trigger its callback
	to continue, however if the hook call its callback with an error, the request will be aborted.



#### *beforeCreate*

When:

* a POST request creating a new document (not POST request executing a method)
* a PUT request creating a new document or overwriting a whole document

The `context.incomingDocument` contains the document about to be created: it can be altered by the hook.

If `context.existing` is set, this is the document that will be overwritten.



#### *beforeModify*

When:

* a PATCH request on a document or a document part
* a PUT request on a subpart of a document (it's internally transformed into a PATCH request)

The `context.patchDocument` contains the patch about to be issued: it can be altered by the hook.

The `context.existing` is always set, and contains the document that will be patched.



#### *beforeDelete*

When:

* a DELETE request deleting a document



