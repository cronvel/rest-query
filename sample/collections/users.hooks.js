

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-hooks' ) ;



module.exports = {
	
	beforeCreate: function( context , callback ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		context.performer.getUser( function( error , user ) {
			log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
			callback() ;
		} ) ;
	} ,
	
	beforeCreateDocument: function( rawDocument ) {
		if ( ! rawDocument.login ) { rawDocument.login = rawDocument.email ; }
		if ( ! rawDocument.slugId ) { rawDocument.slugId = restQuery.slugify( rawDocument.firstName + '-' + rawDocument.lastName ) ; }
		return rawDocument ;
	}
} ;
