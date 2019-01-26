
"use strict" ;

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'root-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	supaMethod: context => {
		log.debug( '>>>>>>>>>> supaMethod, context: %I' , context ) ;
		
		if ( ! context.input.document ) {
			context.output.data = { done: "nothing" , cause: "this is a GET request" } ;
		}
		else {
			context.output.data = { done: "something" , to: context.input.document.to } ;
		}
		
		return Promise.resolved ;
	}
} ;
                                            