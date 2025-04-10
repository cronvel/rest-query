

# Rest Query

![Rest Query](https://raw.githubusercontent.com/cronvel/rest-query/master/logo/rest-query.png)

Work in progress, early alpha.

**/!\ This documentation is still a work in progress! /!\\**





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
If one hook call `context.done()`, it will prevent default behavior as well as subsequent hooks.

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



#### *beforeCreateAfterValidate*

When:

* a POST request creating a new document (not POST request executing a method)
* a PUT request creating a new document or overwriting a whole document
* executed before the document is inserted
* it forces a document's validation (which is usually done when saving it to the DB)
* executed after a successful validation, if the hook rejects, the document is dropped, thus never saved to the DB

The `context.document` contains the freshly created and validated document (but not saved/inserted into the DB,
also note that `context.hook.incomingDocument` does not exist anymore, contrary to the *beforeCreate* hook,
it's already turned into a Document instance).

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

If `context.hook.deletedDocument` is set, this is the document that have been deleted (this is the same document as `context.hook.existingDocument`
in the *beforeCreate* hook).

If `context.linkerObjectNode` is set, then the freshly created resource is linked by that *objectNode* (e.g. PUT on a link).



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

The `context.hook.appliedPatch` contains the patch that have been applied, it could be different from `context.hook.incomingPatch`
of the *beforeModify* hook because it was sanitized before being applied.

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
* executed after a user had matched
* executed before the password check
* executed before the token creation, if it rejects the token creation is aborted

The `context.hook.incomingDocument` contains the connection document: it can be altered by the hook.
The `context.document` contains the matching user for which a token could be created.



#### *afterCreateToken*

For documents of collection: Users.

When:

* the createToken method is invoked on a user
* executed after the token creation
* the user document is already saved

The `context.document` contains the user for which the token is created.
The `context.hook.token` contains the token data.

Can be useful for things like setting `lastVisit`.



#### *beforeRegenerateToken*

For documents of collection: Users.

When:

* the regenerateToken method is invoked on a user
* executed after checking and retrieving the connected user performing the request
* executed before the new token creation, if it rejects the new token creation is aborted

The `context.document` contains the connected user user performing the request.



#### *afterRegenerateToken*

For documents of collection: Users.

When:

* the regenerateToken method is invoked on a user
* executed after the token creation

The `context.document` contains the user for which a new token is created.
The `context.hook.token` contains the token.



#### *beforeCreateApiKey*

For documents of collection: Users.

When:

* the createApiKey method is invoked on a user
* executed before the API key creation, if it rejects the token creation is aborted

The `context.hook.incomingDocument` contains the incoming document: it can be altered by the hook.
The `context.document` contains the matching user for which a token could be created.



#### *afterCreateApiKey*

For documents of collection: Users.

When:

* the createApiKey method is invoked on a user
* executed after the API key creation

The `context.document` contains the user for which the API key is created.
The `context.hook.apiKey` contains the API key.




<a name="ref.common-context"></a>
## Context

All hooks, collection methods and object methods receive a `Context` instance as their unique argument.
A *context* contains all data relative to the request in-progress, and is used internally as well.
It is of utmost importance to know how work a context, because it's the only input and output for userland code.

This is the data structure of a context:
                                                    
* app `App` the app instance
* input `Object` contains data that have been passed as input (e.g. by a HTTP client), where:
	* method `string` the original method used (i.e. the lower-cased HTTP method)
	* pathParts `Array` the fully parsed path to the resource
	* query `Object` particular query (filters, populate, params -- for methods, etc...) to apply on the resource
	* document `Object` (optional) the given document, if any (e.g. the body of a HTTP PUT request)
	* attachmentStreams `Object` (optional) the given binary stream, if any (e.g. a part of a multipart body of a HTTP PUT request)
* output `Object` contains data that goes alongside with the main resource about to be sent (e.g. to a HTTP client or to a hook, etc), where:
	* data `object` or `Stream` the data that is the response of the request
	* extraData `object` (optional) extra data result of *before*-type of hook that further processing may include in the final data object (only few rare methods care)
	* httpStatus (optional) `number` a particular HTTP status that may overide the default one
	* meta `Object` (optional) meta-data of the document, common meta data:
		* contentType (optional) `string` the type of the content, default to `application/json`
		* filename (optional) `string` if binary data is about to be sent, this is the name of the file
	* serializer `Function` (optional) the serializer to use, default to JSON.stringify()
	* serializerArg (optional) an extra argument to pass to the serializer
* performer `Performer` it represents the entity performing the action, it can retrieve a user (if connected and if it's not a *system performer*)
  as well as its group, and is mainly used for rights/access managements
* pathParts `Array` the remaining and fully parsed path to the resource, different from `.input.pathParts`, since it only contains the remaining parts
* alter `Object` contains current schema's alteration
* collectionNode `CollectionNode` hold current *collectionNode*
* objectNode `ObjectNode` (optional) hold current *objectNode*
* parentObjectNode `ObjectNode` (optional) hold the parent *objectNode* of the current *objectNode*, or the parent *objectNode* of the current *collectionNode*
* targetCollectionNode `CollectionNode` (optional) *internal usage only*
* ancestors `Array` *internal usage only*
* batchOf `Array` (optional) *internal usage only*
* getBatchQuery `Object` (optional) *internal usage only*
* getBatchOptions `Object` (optional) *internal usage only*
* linkerObjectNode `ObjectNode` (optional) the *objectNode* that is linking to the current node
* linkerPath (optional) *internal usage only*
* document `Document` (optional) the targeted/created/related document in its final state, for object methods it is the same as `.objectNode.object`
* patch `Object` (optional) a patch to apply to a *document*
* isDone `boolean` true if there is nothing more to do for this request (however, no hook or methods will be called with `isDone: true`)
* hook `Object` hook-specific data, may change from one hook to another, so see the hook documentation for details.
  Some non-exhaustive common properties:
	* incomingDocument `Object` (optional) a whole document to create or that will overwrite another.
	* incomingPatch `Object` (optional) a patch to apply on a existing document.
	* appliedPatch `Object` (optional) a patch that have been applied on a existing document (afterModify)
	* existingDocument `Object` (optional) if set, it is an existing document about to be patched or overwritten.
	* deletedDocument `Object` (optional) if set, it is a document that have been deleted or replaced.
* usr `Object` userland-specific data, can be used to communicate informations from upstream hooks to downstream hooks



Furthermore, the context object has this public methods:

* done(): mark the current request as done/finished, preventing any Rest Query's default behavior
* getUserBatch( [methodFilter] ): an **async** function (only works for collection methods) returning the same batch that would be returned by the query
  if there wasn't any method part in the URL.
  Query-string filters, sort, limits, skips, populate and so on are also applied.
  This is useful for collection methods that are not simple namespaced methods, but instead methods that are applied on a batch.
  Because it is the same batch that would be returned without the method part of the URL, this means that **RIGHT MANAGEMENTS ARE ALSO APPLIED**,
  filtering document that are not visible to this specific user.
  The optional argument *methodFilter* pass an extra filter passed by the method for its particular usage.
* getRealBatch( [methodFilter] ): an **async** function (only works for collection methods), mostly like `.getUserBatch()` but it returns all documents,
  even those that the right management would ignore.
  It should be used for methods that **DO NOT RETURN THOSE DOCUMENTS** but instead compute things on them, like anonymous statistics.
  Moreover, no population of any kind is applied, but query-string filters, sort, limits and skips are still valid.
  This is because we only want the correct document list.
  The optional argument *methodFilter* pass an extra filter passed by the method for its particular usage.
* streamUserBatch( callbacks , [batchSize] , [methodFilter] ): an **async** function (only works for collection methods).
  The `batchSize` argument is used to define the underlying batch size of RootsDB stream: lower values use less memory but are inefficient
  when the batch have to be populated (population is done once per partial batch), on the contrary higher value is faster when population
  is needed at the cost of high memory footprint (default to RootsDB default `.findPartialBatchGenerator()`'s `batchSize` option)
  Similar to `.getUserBatch()`, but used for streaming.
  Each document is passed to the iterator.
  The `callbacks` argument is an object where:
    * prepare: (optional) callback (sync) used to prepare things once the context object is up to date, executed before any other callback, having arguments:
        * context: the Context
    * head: (optional) async callback used to add thing at the begining, having arguments:
        * context: the Context
    * document: (mandatory) async callback used to transform each document, having arguments:
        * context: the Context
        * document: the current document
    * trail: (optional) async callback used to add thing at the end, having arguments:
        * context: the Context
* streamRealBatch( callbacks , [batchSize] , [methodFilter] ): an **async** function (only works for collection methods), mostly like `.streamUserBatch()`
  but it returns all documents.
  Similar to `.getRealBatch()`, but used for streaming.
  Each document is passed to the iterator.
  The `callbacks` works the same than `.streamUserBatch()`.



## Job Runners

A Job Runner is a function of the form: `function( jobData , job , app )`.

* jobData `any` the data to be processed by the job runner, this is pure userland
* job `Scheduler.Job` it is the Job instance calling this runner, it can be used to call the Job's API
* app `App` it is App instance running the Scheduler

The Scheduler await for this function, so it MUST be async or return a `Promise`.
After awaiting, the job is considered done and no more actions should be hanging.

If it throws, the job is considered failed and may be retried later.
If it is a permanent error, the job runner should throw an Error having a `fatal` property set to true.

