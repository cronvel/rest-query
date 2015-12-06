


var restQuery = require( '../lib/restQuery.js' ) ;
var log = restQuery.log.global.use( 'workers' ) ;



module.exports = {
	
	mail: function mail( context , scheduledTask , callback ) {
		
		log.info( 'Received a new task: %I' , scheduledTask.data ) ;
		//console.log( context ) ;
		callback() ;
	}
} ;
                                            