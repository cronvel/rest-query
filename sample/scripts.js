
"use strict" ;

var restQuery = require( '..' ) ;
var Promise = require( 'seventh' ) ;
var log = restQuery.log.global.use( 'scripts' ) ;



module.exports = {
	test: async function( app , ... args ) {
		log.info( "This is a test script, arguments: %I" , args ) ;
	}
} ;

                                            