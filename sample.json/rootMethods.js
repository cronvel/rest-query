


var restQuery = require( '../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'root-methods' ) ;



module.exports = {
	
	supaMethod: function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
		log.debug( '>>>>>>>>>> supaMethod, context: %I' , arguments ) ;
		
		callback( undefined , { done: 'something' , to: incomingDocument.to } ) ;
	}
} ;
                                            