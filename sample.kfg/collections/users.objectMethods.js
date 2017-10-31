

var restQuery = require( '../../lib/restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'users-methods' ) ;

var Promise = require( 'seventh' ) ;



module.exports = {
	
	changeFirstName: function( pathParts , incomingDocument , attachmentStreams , context ) {
		
		//log.fatal( '>>>>>>>>>> changeFirstName, context: %I \n\nTHIS:\n%I\n' , arguments , this ) ;
		
		if ( ! incomingDocument )
		{
			return { done: "nothing" , cause: "this is a GET request" } ;
		}
		
		return new Promise( ( resolve , reject ) => {
			
			if ( incomingDocument.firstName )
			{
				this.object.$.patch( { firstName: incomingDocument.firstName } ) ;
				this.object.$.commit( error => {
					resolve( { done: "something" , to: this.object } ) ;
				} ) ;
				return ;
			}
			
			resolve( { done: "nothing" , to: this.object } ) ;
		} ) ;
	}
} ;
