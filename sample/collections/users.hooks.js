

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-hooks' ) ;



module.exports = {
	
	beforeCreate: function( context , callback ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		if ( ! context.incomingDocument.login ) { context.incomingDocument.login = context.incomingDocument.email ; }
		
		if ( ! context.incomingDocument.slugId )
		{
			context.incomingDocument.slugId = restQuery.slugify( context.incomingDocument.firstName + '-' + context.incomingDocument.lastName ) ;
		}
		
		context.input.performer.getUser( function( error , user ) {
			log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
			callback() ;
		} ) ;
	}
} ;
