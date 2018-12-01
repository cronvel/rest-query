

## Workers

A worker is a function of the form: `function( scheduledTask , workerContext )`.

* scheduledTask `Object` it is a document of the ScheduledTask collection, that triggered the worker, userland code may
	store custom data into the `scheduledTask.data` object.
	
* workerContext `Object` currently unused (this is an empty object `{}`)

The *this* context is the instance of `App`.

