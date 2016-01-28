/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

	Copyright (c) 2015 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/



// Access level

module.exports = {} ;

Object.defineProperties( module.exports , {
	none: { value: 0 , enumerable: true } ,
	passThrough: { value: 1 , enumerable: true } ,
	partialRead: { value: 2 , enumerable: true } ,
	read: { value: 3 , enumerable: true } ,
	readCreate: { value: 4 , enumerable: true } ,
	readCreateModify: { value: 5 , enumerable: true } ,
	all: { value: 6 , enumerable: true }	// imply: delete, move (modify parent), modify access
} ) ;



return ;


var access = {
	read: 5 ,				// Read level (tier) on that node
	write: 3 ,				// Write level (tier) on that node
	delete:	0 ,			// Delete right that node
	
	traverse: 1 ,		// Traverse right for all children collection
	create: 1 ,		// Create right for all children collection
	
	traversePerCollection: {				// Traverse right, per child collection
		tasks: 1 ,
		comment: 1 ,
		article: 0
	} ,
	
	createPerCollection: {				// Create right, per child collection
		tasks: 1 ,
		comment: 1 ,
		article: 0
	} ,
	
	inheritanceAll: {
		
		read: 5 ,				// Read level (tier) on that node
		write: 3 ,				// Write level (tier) on that node
		delete:	0 ,			// Delete right that node
		
		traverse: 1 ,		// Traverse right for all children collection
		create: 1 ,		// Create right for all children collection
		
	} ,
} ;



Object.defineProperties( module.exports , {
	none: { value: 0 , enumerable: true } ,
	passThrough: { value: 1 , enumerable: true } ,
	partialRead: { value: 2 , enumerable: true } ,
	read: { value: 3 , enumerable: true } ,
	readCreate: { value: 4 , enumerable: true } ,
	readCreateModify: { value: 5 , enumerable: true } ,
	all: { value: 6 , enumerable: true }	// imply: delete, move (modify parent), modify access
} ) ;


