
"use strict" ;

var restQuery = require( '..' ) ;
var Promise = require( 'seventh' ) ;
var log = restQuery.log.global.use( 'workers' ) ;



module.exports = {
	mail: function( context , scheduledTask ) {
		log.info( "Received a new 'mail' task: %I" , scheduledTask.data ) ;
		//console.log( context ) ;
		return Promise.resolved ;
	}
} ;
                                            