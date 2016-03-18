

## Common context

<a name="ref.common-context.input"></a>
* input `Object` contains data that have been passed as input (e.g. by a HTTP client, or by an internal call), where:
	
	* method `string` the original method used (i.e. the lower-cased HTTP method)
	* pathParts `Array` the fully parsed path to the resource
	* query `Object` particular query (filters, populate, etc...) to apply on the resource
	* performer `Object` an instance of `restQuery.Performer`, it represents the user or the entity performing the action
	* document `Object` (optional) the given document, if any (e.g. the body of a HTTP PUT request)
	* attachmentStreams `Object` (optional) the given binary stream, if any (e.g. a part of a multipart body of a HTTP PUT request)

<a name="ref.common-context.output"></a>
* output `Object` contains data that goes alongside with the main resource about to be sent (e.g. to a HTTP client,
	or to an internal callback), where:
	
	* httpStatus (optional) `number` a particular HTTP status that may overide the default one
	* meta `Object` (optional) meta-data of the document, common meta data:
		
		* contentType (optional) `string` the type of the content, default to `application/json`
		* filename (optional) `string` if binary data is about to be sent, this is the name of the file
	
	* serializer `Function` (optional) the serializer to use, default to JSON.stringify()
	* serializerArg (optional) an extra argument to pass to the serializer