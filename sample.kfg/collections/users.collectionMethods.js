

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-methods' ) ;



module.exports = {
	
	doSomething: function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
		log.debug( '>>>>>>>>>> doSomething, context: %I' , arguments ) ;
		
		if ( ! incomingDocument )
		{
			return { done: "nothing" , cause: "this is a GET request" } ;
		}
		
		return { done: "something" , to: incomingDocument.to } ;
	}
} ;
