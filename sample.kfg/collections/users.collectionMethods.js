

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	doSomething: function( pathParts , incomingDocument , attachmentStreams , context ) {
		log.debug( '>>>>>>>>>> doSomething, context: %I' , arguments ) ;
		
		if ( ! incomingDocument ) {
			context.output.data = { done: "nothing" , cause: "this is a GET request" } ;
		}
		else {
			context.output.data = { done: "something" , to: incomingDocument.to } ;
		}
		
		return Promise.resolved ;
	}
} ;
