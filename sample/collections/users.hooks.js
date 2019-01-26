
"use strict" ;

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'users-hooks' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: function( context ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		if ( ! context.incomingDocument.login ) { context.incomingDocument.login = context.incomingDocument.email ; }
		
		if ( ! context.incomingDocument.slugId ) {
			context.incomingDocument.slugId = restQuery.slugify( context.incomingDocument.firstName + '-' + context.incomingDocument.lastName ) ;
		}
		
		return context.input.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
		} ) ;
	} ,

	afterCreateToken: function( context ) {
		log.debug( '>>>>>>>>>> afterCreateToken, context: %I' , context ) ;
		return Promise.resolved ;
	}
} ;
