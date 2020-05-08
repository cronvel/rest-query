
!!! WIP !!! NOT COMPLETE !!!


## App Config

### Top-Level

#### defaultPublicAccess

Global default public access, i.e. default² public access, i.e. default public access for all collections that does not define their own default public access.
See Collections' *defaultPublicAccess*.



## Collection Config

### Top-Level

#### hooks

An object of functions.
Define hooks for the collection.
See the hook documentation for details.



#### collectionMethods

An object of functions.
Define collection-level methods for this collection.



#### objectMethods

An object of functions.
Define object-level (document) methods for this collection.



#### autoCollection

The name of collection used as auto-collection.
This auto-collection is implicitly used by the HTTP URL parser, when a collection is expected.



#### defaultPublicAccess

A default value for the document *publicAccess*, i.e. all **newly created** documents will have its *publicAccess* set to this value
if not defined **at creation time**.
It's not retro-active.



#### deepPopulateLimit

Depth limit for *deepPopulate*.
The depth depends on sub-document, not sub-object (i.e. embedded data).



#### refreshTimeout

**Only available for the root object.**
Because the root object is always needed, it is cached to avoid too much DB round-trip.
This property set the TTL of the root object in the in-app memory, in ms.
If the root object often changes (e.g. rights/access inheritance) and there are multiple instances of Rest Query running, this value should be lowered.
If there is only one Rest Query instance or no root object changes, this value could be set to *Infinity*.



#### unindexedQueries

A boolean, true if queries on collections are allowed on unindexed properties.
Default to false, because it can obviously slow down the app.



#### queryLimit

An integer, the hard-limit of documents in the batch returned by a collection query.



#### slugGeneration

Object.
Define how slugs are automatically generated.

Properties:

* properties: array of string (properties) used to create the slug
* retry: boolean (default: false), if the slug already exists (duplicate key), retry another slug
* joint: string (optional: true), the string used to join multiple properties

TODOC: There are more options.



#### alterSchemaProperty

A property in the document altering the schema.
TODOC.

