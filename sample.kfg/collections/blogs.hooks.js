

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'blogs-hooks' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	beforeCreate: function( context ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		return new Promise( ( resolve , reject ) => {
			context.input.performer.getUser( ( error , user ) => {
				log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
				resolve() ;
			} ) ;
		} ) ;
	} ,
	
	beforeModify: function( context ) {
		log.debug( '>>>>>>>>>> beforeModify, context: %I' , context ) ;
		
		return new Promise( ( resolve , reject ) => {
			context.input.performer.getUser( ( error , user ) => {
				log.debug( '>>>>>>>>>> beforeModify, user: %I' , user ) ;
				resolve() ;
			} ) ;
		} ) ;
	} ,
	
	beforeDelete: function( context ) {
		log.debug( '>>>>>>>>>> beforeDelete, context: %I' , context ) ;
		
		return new Promise( ( resolve , reject ) => {
			context.input.performer.getUser( ( error , user ) => {
				log.debug( '>>>>>>>>>> beforeDelete, user: %I' , user ) ;
				resolve() ;
			} ) ;
		} ) ;
	}
} ;
