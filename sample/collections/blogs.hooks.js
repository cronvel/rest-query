

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'blogs-hooks' ) ;



module.exports = {
	
	beforeCreate: function( context , callback ) {
		log.debug( '>>>>>>>>>> beforeCreate, context: %I' , context ) ;
		
		context.input.performer.getUser( function( error , user ) {
			log.debug( '>>>>>>>>>> beforeCreate, user: %I' , user ) ;
			callback() ;
		} ) ;
	} ,
	
	beforeModify: function( context , callback ) {
		log.debug( '>>>>>>>>>> beforeModify, context: %I' , context ) ;
		
		context.input.performer.getUser( function( error , user ) {
			log.debug( '>>>>>>>>>> beforeModify, user: %I' , user ) ;
			callback() ;
		} ) ;
	} ,
	
	beforeDelete: function( context , callback ) {
		log.debug( '>>>>>>>>>> beforeDelete, context: %I' , context ) ;
		
		context.input.performer.getUser( function( error , user ) {
			log.debug( '>>>>>>>>>> beforeDelete, user: %I' , user ) ;
			callback() ;
		} ) ;
	} ,
} ;
