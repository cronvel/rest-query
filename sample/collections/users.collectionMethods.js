

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	doSomething: context => {
		log.debug( '>>>>>>>>>> doSomething, context: %I' , context ) ;
		
		if ( ! context.input.document ) {
			context.output.data = { done: "nothing" , cause: "this is a GET request" } ;
		}
		else {
			context.output.data = { done: "something" , to: context.input.document.to } ;
		}
		
		return Promise.resolved ;
	}
} ;
