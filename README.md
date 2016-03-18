

# restQuery: perform REST queries on your database!

Work in progress, early alpha.

**/!\ This documentation is a work in progress! /!\\**





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
	see [*Common context*](#ref.common-context)

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





## Request callback

All request accept a callback of the form: `function( error , response , responseContext )`.

* error: if set, then the request has not been performed, for various reasons, e.g.
	* an application error (internal error)
	* the user performing the action is not authorized
	* the request does not make any sense
	* the requested resources does not exist
	* and so on...

* response `Object` it is the response to the request, it depends on the kind of request, it can be:
	* a document
	* a batch of documents
	* a response object (not a document, but an object with insightful information about what happend, e.g. the ID of
		a resource created by a POST request)
	* a binary stream to send back to the client
	
* responseContext `Object` an object containing various information on the current request to be processed,     
	see [*Common context*](#ref.common-context)




<a name="ref.common-context"></a>
## Common context

This is the common object format passed to hook, custom method and as the third argument of the request callback.
Usual properties are:
                                                    
* input `Object` contains data that have been passed as input (e.g. by a HTTP client, or by an internal call), where:
	
	* method `string` the original method used (i.e. the lower-cased HTTP method)
	* pathParts `Array` the fully parsed path to the resource
	* query `Object` particular query (filters, populate, etc...) to apply on the resource
	* performer `Object` an instance of `restQuery.Performer`, it represents the user or the entity performing the action
	* document `Object` (optional) the given document, if any (e.g. the body of a HTTP PUT request)
	* attachmentStreams `Object` (optional) the given binary stream, if any (e.g. a part of a multipart body of a HTTP PUT request)

* output `Object` contains data that goes alongside with the main resource about to be sent (e.g. to a HTTP client,
	or to an internal callback), where:
	
	* httpStatus (optional) `number` a particular HTTP status that may overide the default one
	* meta `Object` (optional) meta-data of the document, common meta data:
		
		* contentType (optional) `string` the type of the content, default to `application/json`
		* filename (optional) `string` if binary data is about to be sent, this is the name of the file
	
	* serializer `Function` (optional) the serializer to use, default to JSON.stringify()
	* serializerArg (optional) an extra argument to pass to the serializer

* collectionNode `Object` instance of `restQuery.collectionNode` of the context of this hook
* objectNode `Object` (optional) instance of `restQuery.objectNode` of the context of this hook
* parentObjectNode `Object` (optional) instance of `restQuery.objectNode` of the context of this hook, is set when
	the `objectNode` property does not make sense (e.g. POST on a collection)
* document `Object` (optional) the targeted/created document in its final state.
* incomingDocument `Object` (optional) a whole document to create or that will overwrite another.
* patchDocument `Object` (optional) a patch to apply on a existing document.
* existingDocument `Object` (optional) if set, it is an existing document about to be patched or overwritten.
* linker `Object` (optional) the objectNode that linked the document


