#!/usr/bin/env node

'use strict';

var raml = require('raml-parser');
var fs = require('fs');
var Q = require('q');

function _parseBaseUri(ramlObj) {
  // I have no clue what kind of variables the RAML spec allows in the baseUri.
  // For now keep it super super simple.
  if (ramlObj.baseUri) {
    ramlObj.baseUri = ramlObj.baseUri.replace('{version}', ramlObj.version);
  }

  return ramlObj;
}

function _ltrim(str, chr) {
  var rgxtrim = (!chr) ? new RegExp('^\\s+') : new RegExp('^' + chr + '+');
  return str.replace(rgxtrim, '');
}

function _makeUniqueId(resource) {
  var fullUrl = resource.parentUrl + resource.relativeUri;
  return _ltrim(fullUrl.replace(/\W/g, '_'), '_');
}

function _traverse(ramlObj, parentUrl, allUriParameters) {
  // Add unique id's and parent URL's plus parent URI parameters to resources
  for (var index in ramlObj.resources) {
    if (ramlObj.resources.hasOwnProperty(index)) {
      var resource = ramlObj.resources[index];

      resource.parentUrl = parentUrl || '';
      resource.uniqueId = _makeUniqueId(resource);
      resource.relativeUri = resource.relativeUri.replace(/\{([^0-9]+)[0-9]\}/, '{$1}');

      resource.allUriParameters = [];

      if (allUriParameters) {
        resource.allUriParameters.push.apply(resource.allUriParameters, allUriParameters);
      }

      if (resource.uriParameters) {
        for (var key in resource.uriParameters) {
          if (resource.uriParameters.hasOwnProperty(key)) {
            resource.uriParameters[key].displayName = resource.uriParameters[key].displayName.replace(/^([^0-9]+)[0-9]$/, '$1');
            resource.allUriParameters.push(resource.uriParameters[key]);
          }
        }
      }

      if (resource.methods) {
        for (var methodkey in resource.methods) {
          if (resource.methods.hasOwnProperty(methodkey)) {
            resource.methods[methodkey].allUriParameters = resource.allUriParameters;
          }
        }
      }

      _traverse(resource, resource.parentUrl + resource.relativeUri, resource.allUriParameters);
    }
  }

  return ramlObj;
}

function _addUniqueIdsToDocs(ramlObj) {
  // Add unique id's to top level documentation chapters
  for (var idx in ramlObj.documentation) {
    if (ramlObj.documentation.hasOwnProperty(idx)) {
      var docSection = ramlObj.documentation[idx];
      docSection.uniqueId = docSection.title.replace(/\W/g, '-');
    }
  }

  return ramlObj;
}

function _parseSchemas(ramlObj) {
  ramlObj.parsedSchemas = ramlObj.parsedSchemas || {};
  for (var schemaIx in ramlObj.schemas) {
    for (var schemaName in ramlObj.schemas[schemaIx]) {
      ramlObj.parsedSchemas[schemaName] = JSON.parse(ramlObj.schemas[schemaIx][schemaName]);
    }
  }

  return ramlObj;
}

function _renameErrors(ramlObj) {
	// errors are added in the format "(error)" to the RAML document. As this cannot be parsed in nunjucks
	ramlObj.errors = ramlObj["(errors)"];
	ramlObj["(errors)"] = undefined;
  return ramlObj;
}

function _enhanceRamlObj(ramlObj) {
  ramlObj = _parseBaseUri(ramlObj);
  ramlObj = _traverse(ramlObj);
  ramlObj = _addUniqueIdsToDocs(ramlObj);
  ramlObj = _parseSchemas(ramlObj);
  return _renameErrors(ramlObj);
}

function _sourceToRamlObj(source) {
  var settings = {validate: false};
  if (typeof source === 'string') {
    if (fs.existsSync(source) || source.indexOf('http') === 0) {
      // Parse as file or url
      return raml.loadFile(source, settings);
    }

    // Parse as string or buffer
    return raml.load('' + source);
  } else if (source instanceof Buffer) {
    // Parse as buffer
    return raml.load('' + source);
  } else if (typeof source === 'object') {
    // Parse RAML object directly
    return Q.fcall(function() {
      return source;
    });
  }

  return Q.fcall(function() {
    throw new Error('_sourceToRamlObj: You must supply either file, url, data or obj as source.');
  });
}

function parse(source) {
  return _sourceToRamlObj(source).then(function(ramlObj) {
    return _enhanceRamlObj(ramlObj);
  });
}

module.exports.parse = parse;
