


var restQuery = require( '../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'init' ) ;



module.exports = {
	init: function init( context , callback ) {
	
		log.info( 'Starting init phase' ) ;
		//console.log( context ) ;
		callback() ;
	}
} ;
                                            