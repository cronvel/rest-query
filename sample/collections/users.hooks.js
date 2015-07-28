
restQuery = require( '../../lib/restQuery.js' ) ;

module.exports = {
	
	beforeCreateDocument: function( rawDocument ) {
		if ( ! rawDocument.login ) { rawDocument.login = rawDocument.email ; }
		if ( ! rawDocument.slugId ) { rawDocument.slugId = restQuery.slugify( rawDocument.firstName + '-' + rawDocument.lastName ) ; }
		return rawDocument ;
	}
} ;
