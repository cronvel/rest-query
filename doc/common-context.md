


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

* document `Object` (optional) the targeted/created document in its final state.
* incomingDocument `Object` (optional) a whole document to create or that will overwrite another.
* incomingPatch `Object` (optional) a patch to apply on a existing document.
* existingDocument `Object` (optional) if set, it is an existing document about to be patched or overwritten.
* deletedDocument `Object` (optional) if set, it is a document that have been deleted or replaced.
* collectionNode `Object` instance of `restQuery.collectionNode` of the context of this hook
* objectNode `Object` (optional) instance of `restQuery.objectNode` of the context of this hook
* parentObjectNode `Object` (optional) instance of `restQuery.objectNode` of the context of this hook, is set when
	the `objectNode` property does not make sense (e.g. POST on a collection)
* linkerObjectNode `Object` (optional) the objectNode that linked the document


