

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-hooks' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: function( context ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		if ( ! context.incomingDocument.login ) { context.incomingDocument.login = context.incomingDocument.email ; }
		
		if ( ! context.incomingDocument.slugId )
		{
			context.incomingDocument.slugId = restQuery.slugify( context.incomingDocument.firstName + '-' + context.incomingDocument.lastName ) ;
		}
		
		return new Promise( ( resolve , reject ) => {
			context.input.performer.getUser( ( error , user ) => {
				log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
				resolve() ;
			} ) ;
		} ) ;
	}
} ;
