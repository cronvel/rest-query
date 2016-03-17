

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-methods' ) ;



module.exports = {
	
	changeFirstName: function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
		
		var self = this ;
		
		//log.fatal( '>>>>>>>>>> changeFirstName, context: %I \n\nTHIS:\n%I\n' , arguments , this ) ;
		
		if ( incomingDocument.firstName )
		{
			this.object.$.patch( { firstName: incomingDocument.firstName } ) ;
			this.object.$.commit( function( error ) {
				callback( undefined , { done: 'something' , to: self.object } ) ;
			} ) ;
			return ;
		}
		
		callback( undefined , { done: 'nothing' , to: self.object } ) ;
	}
} ;
