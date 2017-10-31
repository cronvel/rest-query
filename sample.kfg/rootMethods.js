


var restQuery = require( '../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'root-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	supaMethod: function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
		log.debug( '>>>>>>>>>> supaMethod, context: %I' , arguments ) ;
		
		if ( ! incomingDocument )
		{
			return { done: "nothing" , cause: "this is a GET request" } ;
		}
		
		return { done: "something" , to: incomingDocument.to } ;
	}
} ;
                                            