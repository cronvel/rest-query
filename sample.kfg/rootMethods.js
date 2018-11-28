


var restQuery = require( '../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'root-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	supaMethod: function( pathParts , incomingDocument , attachmentStreams , context ) {
		log.debug( '>>>>>>>>>> supaMethod, context: %I' , arguments ) ;
		
		if ( ! incomingDocument ) {
			context.output.data = { done: "nothing" , cause: "this is a GET request" } ;
		}
		else {
			context.output.data = { done: "something" , to: incomingDocument.to } ;
		}
		
		return Promise.resolved ;
	}
} ;
                                            