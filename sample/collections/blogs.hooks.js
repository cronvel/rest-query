

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'blogs-hooks' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: function( context ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		return context.input.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
		} ) ;
	} ,
	
	beforeModify: function( context ) {
		log.debug( '>>>>>>>>>> beforeModify, context: %I' , context ) ;
		
		return context.input.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeModify, user: %I' , user ) ;
		} ) ;
	} ,
	
	beforeDelete: function( context ) {
		log.debug( '>>>>>>>>>> beforeDelete, context: %I' , context ) ;
		
		return context.input.performer.getUser().then( user => {
			log.debug( '>>>>>>>>>> beforeDelete, user: %I' , user ) ;
		} ) ;
	}
} ;
