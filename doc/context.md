


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
	* query `Object` particular query (filters, populate, etc...) to apply on the resource
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
* linkerObjectNode `ObjectNode` (optional) the *objectNode* that is linking to the current node
* linkerPath (optional) *internal usage only*
* document `Document` (optional) the targeted/created document in its final state.
* patch `Object` (optional) a patch to apply to a *document*
* isDone `boolean` true if there is nothing more to do for this request (however, no hook or methods will be called with `isDone: true`)
* hook `Object` hook-specific data, may change from one hook to another, so see the hook documentation for details.
  Some non-exhaustive common properties:
	* incomingDocument `Object` (optional) a whole document to create or that will overwrite another.
	* incomingPatch `Object` (optional) a patch to apply on a existing document.
	* existingDocument `Object` (optional) if set, it is an existing document about to be patched or overwritten.
	* deletedDocument `Object` (optional) if set, it is a document that have been deleted or replaced.



Furthermore, the context object has this public methods:

* done(): mark the current request as done/finished, preventing any Rest Query's default behavior

