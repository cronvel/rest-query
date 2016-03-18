

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
	see (*Common context*)[#ref.common-context]

