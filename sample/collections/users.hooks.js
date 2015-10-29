

var restQuery = require( '../../lib/restQuery.js' ) ;
var logger = require( 'logger-kit' ).global.use( 'users-hooks' ) ;



module.exports = {
	
	beforeCreate: function( incomingDocument , attachmentStreams , context , callback ) {
		logger.info( '>>>>>>>>>> beforeCreate!!!' ) ;
		
		context.performer.getUser( function( error , user ) {
			logger.info( '>>>>>>>>>> beforeCreate: %I' , user ) ;
			callback() ;
		} ) ;
	} ,
	
	beforeCreateDocument: function( rawDocument ) {
		if ( ! rawDocument.login ) { rawDocument.login = rawDocument.email ; }
		if ( ! rawDocument.slugId ) { rawDocument.slugId = restQuery.slugify( rawDocument.firstName + '-' + rawDocument.lastName ) ; }
		return rawDocument ;
	}
} ;
