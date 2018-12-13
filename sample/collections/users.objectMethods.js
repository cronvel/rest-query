

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	changeFirstName: async function( context ) {
		
		//log.fatal( '>>>>>>>>>> changeFirstName, context: %I \n\nTHIS:\n%I\n' , arguments , this ) ;
		
		if ( ! context.input.document ) {
			context.output.data = { done: "nothing" , cause: "this is a GET request" } ;
		}
		else if ( context.input.document.firstName ) {
			await this.object.patch( { firstName: context.input.document.firstName } ) ;
			await this.object.commit() ;
			context.output.data = { done: "something" , to: this.object } ;
			
		}
		else {
			context.output.data = { done: "nothing" , to: this.object } ;
		}
	}
} ;
