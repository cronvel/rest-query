

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
	
* responseContext `Object` an object containing various information on performed request, usually having those common properties:
	
	* input `Object` see (*Common context input*)[#ref.common-context.input]
	* output `Object` see (*Common context output*)[#ref.common-context.output]
	* collectionNode `Object` instance of `restQuery.collectionNode` of the context of this hook
	* objectNode `Object` (optional) instance of `restQuery.objectNode` of the context of this hook
	* parentObjectNode `Object` (optional) instance of `restQuery.objectNode` of the context of this hook, is set when
		the `objectNode` property does not make sense (e.g.: the *leaf* resource is a collection)
	* document `Object` (optional) the targeted/created document in its final state
	* batchOf `Array` (optional) parent batch the current document is part of
	* linker `Object` (optional) the objectNode that linked the document
	
	* patchDocument `Object` (optional) a patch to apply on a existing document.
	* existing `Object` (optional) if set, it is an existing document about to be patched or overwritten.

