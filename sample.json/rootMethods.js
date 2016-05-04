


var restQuery = require( '../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'root-methods' ) ;



module.exports = {
	
	supaMethod: function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
		log.debug( '>>>>>>>>>> supaMethod, context: %I' , arguments ) ;
		
		if ( ! incomingDocument )
		{
			callback( undefined , { done: "nothing" , cause: "this is a GET request" } ) ;
			return ;
		}
		
		callback( undefined , { done: "something" , to: incomingDocument.to } ) ;
	}
} ;
                                            