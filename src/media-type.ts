/**
 * negotiator
 * Copyright(c) 2012 Isaac Z. Schlueter
 * Copyright(c) 2014 Federico Romero
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

"use strict";

/**
 * Module exports.
 * @public
 */

/**
 * Module variables.
 * @private
 */

const simpleMediaTypeRegExp = /^\s*([^\s\/;]+)\/([^;\s]+)\s*(?:;(.*))?$/;

/**
 * Parse the Accept header.
 * @private
 */

function parseAccept(accept: string): MediaType[] {
  const accepts = splitMediaTypes(accept);

  return accepts
    .map((value, index) => parseMediaType(value.trim(), index))
    .filter(value => value);
}

/**
 * Parse a media type from the Accept header.
 * @private
 */

function parseMediaType(str: string, i: number): MediaType {
  const match = simpleMediaTypeRegExp.exec(str);
  if (!match) return undefined;

  const params: { [key: string]: string } = {};
  let q = 1;
  const subtype = match[2];
  const type = match[1];

  if (match[3]) {
    const kvps = splitParameters(match[3]).map(splitKeyValuePair);

    for (let j = 0; j < kvps.length; j++) {
      const pair = kvps[j];
      const key = pair[0].toLowerCase();
      const val = pair[1];

      // get the value, unwrapping quotes
      const value = val && val[0] === "\"" && val[val.length - 1] === "\""
        ? val.substr(1, val.length - 2)
        : val;

      if (key === "q") {
        q = parseFloat(value);
        break;
      }

      // store parameter
      params[key] = value;
    }
  }

  return {
    type: type,
    subtype: subtype,
    params: params,
    q: q,
    i: i
  };
}

/**
 * Get the priority of a media type.
 * @private
 */

function getMediaTypePriority(type: string, accepted: MediaType[], index: number): MediaType | MediaTypeParameters {
  let priority: MediaTypeParameters = {o: -1, q: 0, s: 0, i: undefined};

  for (let i = 0; i < accepted.length; i++) {
    const spec = specify(type, accepted[i], index);

    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
      priority = spec;
    }
  }

  return priority;
}

/**
 * Get the specificity of the media type.
 * @private
 */

function specify(type: string, spec: MediaType, index: number): MediaTypeParameters {
  const p = parseMediaType(type, index);
  let s = 0;

  if (!p) {
    return undefined;
  }

  if (spec.type.toLowerCase() == p.type.toLowerCase()) {
    s |= 4;
  } else if (spec.type != "*") {
    return undefined;
  }

  if (spec.subtype.toLowerCase() == p.subtype.toLowerCase()) {
    s |= 2;
  } else if (spec.subtype != "*") {
    return undefined;
  }

  const keys = Object.keys(spec.params);
  if (keys.length > 0) {
    if (keys.every(function (k) {
      return spec.params[k] == "*" || (spec.params[k] || "").toLowerCase() == (p.params[k] || "").toLowerCase();
    })) {
      s |= 1;
    } else {
      return undefined;
    }
  }

  return {
    i: index,
    o: spec.i,
    q: spec.q,
    s: s,
  };
}

/**
 * Get the preferred media types from an Accept header.
 * @public
 */

export function preferredMediaTypes(accept?: string, provided?: Iterable<string> | ArrayLike<string>): string[] {
  // RFC 2616 sec 14.2: no header = */*
  const accepts = parseAccept(accept === undefined ? "*/*" : accept || "");

  if (!provided) {
    // sorted list of all types
    return accepts
      .filter(isQuality)
      .sort(compareSpecs)
      .map(getFullType);
  }

  const providedArray = Array.from(provided);

  const priorities = providedArray
    .map(function getPriority(type, index) {
      return getMediaTypePriority(type, accepts, index);
    });

  // sorted list of accepted types
  return priorities
    .filter(isQuality)
    .sort(compareSpecs)
    .map(function getType(priority) {
      return providedArray[priorities.indexOf(priority)];
    });
}

type MediaTypeParameters = {
  q: number;
  s: number;
  o: number;
  i: number;
};

type MediaType = {
  type: string;
  subtype: String;
  params: { [key: string]: string },
  q: number,
  i: number
};

/**
 * Compare two specs.
 * @private
 */

function compareSpecs(a: MediaType & MediaTypeParameters, b: MediaType & MediaTypeParameters) {
  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0;
}

/**
 * Get full type string.
 * @private
 */

function getFullType(spec: MediaType) {
  return spec.type + "/" + spec.subtype;
}

/**
 * Check if a spec has any quality.
 * @private
 */

function isQuality(spec: { q: number }) {
  return spec.q > 0;
}

/**
 * Count the number of quotes in a string.
 * @private
 */

function quoteCount(string: string) {
  let count = 0,
    index = 0;

  while ((index = string.indexOf("\"", index)) !== -1) {
    count++;
    index++;
  }

  return count;
}

/**
 * Split a key value pair.
 * @private
 */

function splitKeyValuePair(str: string) {
  const index = str.indexOf("=");
  let key: string;
  let val: string;

  if (index === -1) {
    key = str;
  } else {
    key = str.substr(0, index);
    val = str.substr(index + 1);
  }

  return [key, val];
}

/**
 * Split an Accept header into media types.
 * @private
 */

function splitMediaTypes(accept: string): string[] {
  const accepts = accept.split(",");

  let j = 0;

  for (let i = 1; i < accepts.length; i++) {
    if (quoteCount(accepts[j]) % 2 == 0) {
      accepts[++j] = accepts[i];
    } else {
      accepts[j] += "," + accepts[i];
    }
  }

  // trim accepts
  accepts.length = j + 1;

  return accepts;
}

/**
 * Split a string of parameters.
 * @private
 */

function splitParameters(str: string) {
  const parameters = str.split(";");

  let j = 0;

  for (let i = 1; i < parameters.length; i++) {
    if (quoteCount(parameters[j]) % 2 == 0) {
      parameters[++j] = parameters[i];
    } else {
      parameters[j] += ";" + parameters[i];
    }
  }

  // trim parameters
  parameters.length = j + 1;

  for (let i = 0; i < parameters.length; i++) {
    parameters[i] = parameters[i].trim();
  }

  return parameters;
}
