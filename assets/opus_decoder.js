var Module;
if (!Module) Module = (typeof Module !== "undefined" ? Module : null) || {};
var moduleOverrides = {};
for (var key in Module) {
	if (Module.hasOwnProperty(key)) {
		moduleOverrides[key] = Module[key]
	}
}
var ENVIRONMENT_IS_WEB = typeof window === "object";
var ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
var ENVIRONMENT_IS_NODE = typeof process === "object" && typeof require === "function" && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
if (ENVIRONMENT_IS_NODE) {
	if (!Module["print"]) Module["print"] = function print(x) {
		process["stdout"].write(x + "\n")
	};
	if (!Module["printErr"]) Module["printErr"] = function printErr(x) {
		process["stderr"].write(x + "\n")
	};
	var nodeFS = require("fs");
	var nodePath = require("path");
	Module["read"] = function read(filename, binary) {
		filename = nodePath["normalize"](filename);
		var ret = nodeFS["readFileSync"](filename);
		if (!ret && filename != nodePath["resolve"](filename)) {
			filename = path.join(__dirname, "..", "src", filename);
			ret = nodeFS["readFileSync"](filename)
		}
		if (ret && !binary) ret = ret.toString();
		return ret
	};
	Module["readBinary"] = function readBinary(filename) {
		return Module["read"](filename, true)
	};
	Module["load"] = function load(f) {
		globalEval(read(f))
	};
	if (!Module["thisProgram"]) {
		if (process["argv"].length > 1) {
			Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/")
		} else {
			Module["thisProgram"] = "unknown-program"
		}
	}
	Module["arguments"] = process["argv"].slice(2);
	if (typeof module !== "undefined") {
		module["exports"] = Module
	}
	process["on"]("uncaughtException", (function(ex) {
		if (!(ex instanceof ExitStatus)) {
			throw ex
		}
	}));
	Module["inspect"] = (function() {
		return "[Emscripten Module object]"
	})
} else if (ENVIRONMENT_IS_SHELL) {
	if (!Module["print"]) Module["print"] = print;
	if (typeof printErr != "undefined") Module["printErr"] = printErr;
	if (typeof read != "undefined") {
		Module["read"] = read
	} else {
		Module["read"] = function read() {
			throw "no read() available (jsc?)"
		}
	}
	Module["readBinary"] = function readBinary(f) {
		if (typeof readbuffer === "function") {
			return new Uint8Array(readbuffer(f))
		}
		var data = read(f, "binary");
		assert(typeof data === "object");
		return data
	};
	if (typeof scriptArgs != "undefined") {
		Module["arguments"] = scriptArgs
	} else if (typeof arguments != "undefined") {
		Module["arguments"] = arguments
	}
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
	Module["read"] = function read(url) {
		var xhr = new XMLHttpRequest;
		xhr.open("GET", url, false);
		xhr.send(null);
		return xhr.responseText
	};
	if (typeof arguments != "undefined") {
		Module["arguments"] = arguments
	}
	if (typeof console !== "undefined") {
		if (!Module["print"]) Module["print"] = function print(x) {
			console.log(x)
		};
		if (!Module["printErr"]) Module["printErr"] = function printErr(x) {
			console.log(x)
		}
	} else {
		var TRY_USE_DUMP = false;
		if (!Module["print"]) Module["print"] = TRY_USE_DUMP && typeof dump !== "undefined" ? (function(x) {
			dump(x)
		}) : (function(x) {})
	}
	if (ENVIRONMENT_IS_WORKER) {
		Module["load"] = importScripts
	}
	if (typeof Module["setWindowTitle"] === "undefined") {
		Module["setWindowTitle"] = (function(title) {
			document.title = title
		})
	}
} else {
	throw "Unknown runtime environment. Where are we?"
}

function globalEval(x) {
	eval.call(null, x)
}
if (!Module["load"] && Module["read"]) {
	Module["load"] = function load(f) {
		globalEval(Module["read"](f))
	}
}
if (!Module["print"]) {
	Module["print"] = (function() {})
}
if (!Module["printErr"]) {
	Module["printErr"] = Module["print"]
}
if (!Module["arguments"]) {
	Module["arguments"] = []
}
if (!Module["thisProgram"]) {
	Module["thisProgram"] = "./this.program"
}
Module.print = Module["print"];
Module.printErr = Module["printErr"];
Module["preRun"] = [];
Module["postRun"] = [];
for (var key in moduleOverrides) {
	if (moduleOverrides.hasOwnProperty(key)) {
		Module[key] = moduleOverrides[key]
	}
}
var Runtime = {
	setTempRet0: (function(value) {
		tempRet0 = value
	}),
	getTempRet0: (function() {
		return tempRet0
	}),
	stackSave: (function() {
		return STACKTOP
	}),
	stackRestore: (function(stackTop) {
		STACKTOP = stackTop
	}),
	getNativeTypeSize: (function(type) {
		switch (type) {
			case "i1":
			case "i8":
				return 1;
			case "i16":
				return 2;
			case "i32":
				return 4;
			case "i64":
				return 8;
			case "float":
				return 4;
			case "double":
				return 8;
			default:
				{
					if (type[type.length - 1] === "*") {
						return Runtime.QUANTUM_SIZE
					} else if (type[0] === "i") {
						var bits = parseInt(type.substr(1));
						assert(bits % 8 === 0);
						return bits / 8
					} else {
						return 0
					}
				}
		}
	}),
	getNativeFieldSize: (function(type) {
		return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE)
	}),
	STACK_ALIGN: 16,
	prepVararg: (function(ptr, type) {
		if (type === "double" || type === "i64") {
			if (ptr & 7) {
				assert((ptr & 7) === 4);
				ptr += 4
			}
		} else {
			assert((ptr & 3) === 0)
		}
		return ptr
	}),
	getAlignSize: (function(type, size, vararg) {
		if (!vararg && (type == "i64" || type == "double")) return 8;
		if (!type) return Math.min(size, 8);
		return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE)
	}),
	dynCall: (function(sig, ptr, args) {
		if (args && args.length) {
			if (!args.splice) args = Array.prototype.slice.call(args);
			args.splice(0, 0, ptr);
			return Module["dynCall_" + sig].apply(null, args)
		} else {
			return Module["dynCall_" + sig].call(null, ptr)
		}
	}),
	functionPointers: [],
	addFunction: (function(func) {
		for (var i = 0; i < Runtime.functionPointers.length; i++) {
			if (!Runtime.functionPointers[i]) {
				Runtime.functionPointers[i] = func;
				return 2 * (1 + i)
			}
		}
		throw "Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS."
	}),
	removeFunction: (function(index) {
		Runtime.functionPointers[(index - 2) / 2] = null
	}),
	warnOnce: (function(text) {
		if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
		if (!Runtime.warnOnce.shown[text]) {
			Runtime.warnOnce.shown[text] = 1;
			Module.printErr(text)
		}
	}),
	funcWrappers: {},
	getFuncWrapper: (function(func, sig) {
		assert(sig);
		if (!Runtime.funcWrappers[sig]) {
			Runtime.funcWrappers[sig] = {}
		}
		var sigCache = Runtime.funcWrappers[sig];
		if (!sigCache[func]) {
			sigCache[func] = function dynCall_wrapper() {
				return Runtime.dynCall(sig, func, arguments)
			}
		}
		return sigCache[func]
	}),
	getCompilerSetting: (function(name) {
		throw "You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work"
	}),
	stackAlloc: (function(size) {
		var ret = STACKTOP;
		STACKTOP = STACKTOP + size | 0;
		STACKTOP = STACKTOP + 15 & -16;
		return ret
	}),
	staticAlloc: (function(size) {
		var ret = STATICTOP;
		STATICTOP = STATICTOP + size | 0;
		STATICTOP = STATICTOP + 15 & -16;
		return ret
	}),
	dynamicAlloc: (function(size) {
		var ret = DYNAMICTOP;
		DYNAMICTOP = DYNAMICTOP + size | 0;
		DYNAMICTOP = DYNAMICTOP + 15 & -16;
		if (DYNAMICTOP >= TOTAL_MEMORY) {
			var success = enlargeMemory();
			if (!success) {
				DYNAMICTOP = ret;
				return 0
			}
		}
		return ret
	}),
	alignMemory: (function(size, quantum) {
		var ret = size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16);
		return ret
	}),
	makeBigInt: (function(low, high, unsigned) {
		var ret = unsigned ? +(low >>> 0) + +(high >>> 0) * +4294967296 : +(low >>> 0) + +(high | 0) * +4294967296;
		return ret
	}),
	GLOBAL_BASE: 8,
	QUANTUM_SIZE: 4,
	__dummy__: 0
};
var __THREW__ = 0;
var ABORT = false;
var EXITSTATUS = 0;
var undef = 0;
var tempValue, tempInt, tempBigInt, tempInt2, tempBigInt2, tempPair, tempBigIntI, tempBigIntR, tempBigIntS, tempBigIntP, tempBigIntD, tempDouble, tempFloat;
var tempI64, tempI64b;
var tempRet0, tempRet1, tempRet2, tempRet3, tempRet4, tempRet5, tempRet6, tempRet7, tempRet8, tempRet9;

function assert(condition, text) {
	if (!condition) {
		abort("Assertion failed: " + text)
	}
}
var globalScope = this;

function getCFunc(ident) {
	var func = Module["_" + ident];
	if (!func) {
		try {
			func = eval("_" + ident)
		} catch (e) {}
	}
	assert(func, "Cannot call unknown function " + ident + " (perhaps LLVM optimizations or closure removed it?)");
	return func
}
var cwrap, ccall;
((function() {
	var JSfuncs = {
		"stackSave": (function() {
			Runtime.stackSave()
		}),
		"stackRestore": (function() {
			Runtime.stackRestore()
		}),
		"arrayToC": (function(arr) {
			var ret = Runtime.stackAlloc(arr.length);
			writeArrayToMemory(arr, ret);
			return ret
		}),
		"stringToC": (function(str) {
			var ret = 0;
			if (str !== null && str !== undefined && str !== 0) {
				ret = Runtime.stackAlloc((str.length << 2) + 1);
				writeStringToMemory(str, ret)
			}
			return ret
		})
	};
	var toC = {
		"string": JSfuncs["stringToC"],
		"array": JSfuncs["arrayToC"]
	};
	ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
		var func = getCFunc(ident);
		var cArgs = [];
		var stack = 0;
		if (args) {
			for (var i = 0; i < args.length; i++) {
				var converter = toC[argTypes[i]];
				if (converter) {
					if (stack === 0) stack = Runtime.stackSave();
					cArgs[i] = converter(args[i])
				} else {
					cArgs[i] = args[i]
				}
			}
		}
		var ret = func.apply(null, cArgs);
		if (returnType === "string") ret = Pointer_stringify(ret);
		if (stack !== 0) {
			if (opts && opts.async) {
				EmterpreterAsync.asyncFinalizers.push((function() {
					Runtime.stackRestore(stack)
				}));
				return
			}
			Runtime.stackRestore(stack)
		}
		return ret
	};
	var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;

	function parseJSFunc(jsfunc) {
		var parsed = jsfunc.toString().match(sourceRegex).slice(1);
		return {
			arguments: parsed[0],
			body: parsed[1],
			returnValue: parsed[2]
		}
	}
	var JSsource = {};
	for (var fun in JSfuncs) {
		if (JSfuncs.hasOwnProperty(fun)) {
			JSsource[fun] = parseJSFunc(JSfuncs[fun])
		}
	}
	cwrap = function cwrap(ident, returnType, argTypes) {
		argTypes = argTypes || [];
		var cfunc = getCFunc(ident);
		var numericArgs = argTypes.every((function(type) {
			return type === "number"
		}));
		var numericRet = returnType !== "string";
		if (numericRet && numericArgs) {
			return cfunc
		}
		var argNames = argTypes.map((function(x, i) {
			return "$" + i
		}));
		var funcstr = "(function(" + argNames.join(",") + ") {";
		var nargs = argTypes.length;
		if (!numericArgs) {
			funcstr += "var stack = " + JSsource["stackSave"].body + ";";
			for (var i = 0; i < nargs; i++) {
				var arg = argNames[i],
					type = argTypes[i];
				if (type === "number") continue;
				var convertCode = JSsource[type + "ToC"];
				funcstr += "var " + convertCode.arguments + " = " + arg + ";";
				funcstr += convertCode.body + ";";
				funcstr += arg + "=" + convertCode.returnValue + ";"
			}
		}
		var cfuncname = parseJSFunc((function() {
			return cfunc
		})).returnValue;
		funcstr += "var ret = " + cfuncname + "(" + argNames.join(",") + ");";
		if (!numericRet) {
			var strgfy = parseJSFunc((function() {
				return Pointer_stringify
			})).returnValue;
			funcstr += "ret = " + strgfy + "(ret);"
		}
		if (!numericArgs) {
			funcstr += JSsource["stackRestore"].body.replace("()", "(stack)") + ";"
		}
		funcstr += "return ret})";
		return eval(funcstr)
	}
}))();

function setValue(ptr, value, type, noSafe) {
	type = type || "i8";
	if (type.charAt(type.length - 1) === "*") type = "i32";
	switch (type) {
		case "i1":
			HEAP8[ptr >> 0] = value;
			break;
		case "i8":
			HEAP8[ptr >> 0] = value;
			break;
		case "i16":
			HEAP16[ptr >> 1] = value;
			break;
		case "i32":
			HEAP32[ptr >> 2] = value;
			break;
		case "i64":
			tempI64 = [value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= +1 ? tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
			break;
		case "float":
			HEAPF32[ptr >> 2] = value;
			break;
		case "double":
			HEAPF64[ptr >> 3] = value;
			break;
		default:
			abort("invalid type for setValue: " + type)
	}
}
Module["setValue"] = setValue;

function getValue(ptr, type, noSafe) {
	type = type || "i8";
	if (type.charAt(type.length - 1) === "*") type = "i32";
	switch (type) {
		case "i1":
			return HEAP8[ptr >> 0];
		case "i8":
			return HEAP8[ptr >> 0];
		case "i16":
			return HEAP16[ptr >> 1];
		case "i32":
			return HEAP32[ptr >> 2];
		case "i64":
			return HEAP32[ptr >> 2];
		case "float":
			return HEAPF32[ptr >> 2];
		case "double":
			return HEAPF64[ptr >> 3];
		default:
			abort("invalid type for setValue: " + type)
	}
	return null
}
Module["getValue"] = getValue;
var ALLOC_NORMAL = 0;
var ALLOC_STACK = 1;
var ALLOC_STATIC = 2;
var ALLOC_DYNAMIC = 3;
var ALLOC_NONE = 4;

function allocate(slab, types, allocator, ptr) {
	var zeroinit, size;
	if (typeof slab === "number") {
		zeroinit = true;
		size = slab
	} else {
		zeroinit = false;
		size = slab.length
	}
	var singleType = typeof types === "string" ? types : null;
	var ret;
	if (allocator == ALLOC_NONE) {
		ret = ptr
	} else {
		ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length))
	}
	if (zeroinit) {
		var ptr = ret,
			stop;
		assert((ret & 3) == 0);
		stop = ret + (size & ~3);
		for (; ptr < stop; ptr += 4) {
			HEAP32[ptr >> 2] = 0
		}
		stop = ret + size;
		while (ptr < stop) {
			HEAP8[ptr++ >> 0] = 0
		}
		return ret
	}
	if (singleType === "i8") {
		if (slab.subarray || slab.slice) {
			HEAPU8.set(slab, ret)
		} else {
			HEAPU8.set(new Uint8Array(slab), ret)
		}
		return ret
	}
	var i = 0,
		type, typeSize, previousType;
	while (i < size) {
		var curr = slab[i];
		if (typeof curr === "function") {
			curr = Runtime.getFunctionIndex(curr)
		}
		type = singleType || types[i];
		if (type === 0) {
			i++;
			continue
		}
		if (type == "i64") type = "i32";
		setValue(ret + i, curr, type);
		if (previousType !== type) {
			typeSize = Runtime.getNativeTypeSize(type);
			previousType = type
		}
		i += typeSize
	}
	return ret
}

function getMemory(size) {
	if (!staticSealed) return Runtime.staticAlloc(size);
	if (typeof _sbrk !== "undefined" && !_sbrk.called || !runtimeInitialized) return Runtime.dynamicAlloc(size);
	return _malloc(size)
}

function Pointer_stringify(ptr, length) {
	if (length === 0 || !ptr) return "";
	var hasUtf = 0;
	var t;
	var i = 0;
	while (1) {
		t = HEAPU8[ptr + i >> 0];
		hasUtf |= t;
		if (t == 0 && !length) break;
		i++;
		if (length && i == length) break
	}
	if (!length) length = i;
	var ret = "";
	if (hasUtf < 128) {
		var MAX_CHUNK = 1024;
		var curr;
		while (length > 0) {
			curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
			ret = ret ? ret + curr : curr;
			ptr += MAX_CHUNK;
			length -= MAX_CHUNK
		}
		return ret
	}
	return Module["UTF8ToString"](ptr)
}

function AsciiToString(ptr) {
	var str = "";
	while (1) {
		var ch = HEAP8[ptr++ >> 0];
		if (!ch) return str;
		str += String.fromCharCode(ch)
	}
}

function stringToAscii(str, outPtr) {
	return writeAsciiToMemory(str, outPtr, false)
}

function UTF8ArrayToString(u8Array, idx) {
	var u0, u1, u2, u3, u4, u5;
	var str = "";
	while (1) {
		u0 = u8Array[idx++];
		if (!u0) return str;
		if (!(u0 & 128)) {
			str += String.fromCharCode(u0);
			continue
		}
		u1 = u8Array[idx++] & 63;
		if ((u0 & 224) == 192) {
			str += String.fromCharCode((u0 & 31) << 6 | u1);
			continue
		}
		u2 = u8Array[idx++] & 63;
		if ((u0 & 240) == 224) {
			u0 = (u0 & 15) << 12 | u1 << 6 | u2
		} else {
			u3 = u8Array[idx++] & 63;
			if ((u0 & 248) == 240) {
				u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u3
			} else {
				u4 = u8Array[idx++] & 63;
				if ((u0 & 252) == 248) {
					u0 = (u0 & 3) << 24 | u1 << 18 | u2 << 12 | u3 << 6 | u4
				} else {
					u5 = u8Array[idx++] & 63;
					u0 = (u0 & 1) << 30 | u1 << 24 | u2 << 18 | u3 << 12 | u4 << 6 | u5
				}
			}
		}
		if (u0 < 65536) {
			str += String.fromCharCode(u0)
		} else {
			var ch = u0 - 65536;
			str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
		}
	}
}

function UTF8ToString(ptr) {
	return UTF8ArrayToString(HEAPU8, ptr)
}

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
	if (!(maxBytesToWrite > 0)) return 0;
	var startIdx = outIdx;
	var endIdx = outIdx + maxBytesToWrite - 1;
	for (var i = 0; i < str.length; ++i) {
		var u = str.charCodeAt(i);
		if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
		if (u <= 127) {
			if (outIdx >= endIdx) break;
			outU8Array[outIdx++] = u
		} else if (u <= 2047) {
			if (outIdx + 1 >= endIdx) break;
			outU8Array[outIdx++] = 192 | u >> 6;
			outU8Array[outIdx++] = 128 | u & 63
		} else if (u <= 65535) {
			if (outIdx + 2 >= endIdx) break;
			outU8Array[outIdx++] = 224 | u >> 12;
			outU8Array[outIdx++] = 128 | u >> 6 & 63;
			outU8Array[outIdx++] = 128 | u & 63
		} else if (u <= 2097151) {
			if (outIdx + 3 >= endIdx) break;
			outU8Array[outIdx++] = 240 | u >> 18;
			outU8Array[outIdx++] = 128 | u >> 12 & 63;
			outU8Array[outIdx++] = 128 | u >> 6 & 63;
			outU8Array[outIdx++] = 128 | u & 63
		} else if (u <= 67108863) {
			if (outIdx + 4 >= endIdx) break;
			outU8Array[outIdx++] = 248 | u >> 24;
			outU8Array[outIdx++] = 128 | u >> 18 & 63;
			outU8Array[outIdx++] = 128 | u >> 12 & 63;
			outU8Array[outIdx++] = 128 | u >> 6 & 63;
			outU8Array[outIdx++] = 128 | u & 63
		} else {
			if (outIdx + 5 >= endIdx) break;
			outU8Array[outIdx++] = 252 | u >> 30;
			outU8Array[outIdx++] = 128 | u >> 24 & 63;
			outU8Array[outIdx++] = 128 | u >> 18 & 63;
			outU8Array[outIdx++] = 128 | u >> 12 & 63;
			outU8Array[outIdx++] = 128 | u >> 6 & 63;
			outU8Array[outIdx++] = 128 | u & 63
		}
	}
	outU8Array[outIdx] = 0;
	return outIdx - startIdx
}

function stringToUTF8(str, outPtr, maxBytesToWrite) {
	return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
}

function lengthBytesUTF8(str) {
	var len = 0;
	for (var i = 0; i < str.length; ++i) {
		var u = str.charCodeAt(i);
		if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
		if (u <= 127) {
			++len
		} else if (u <= 2047) {
			len += 2
		} else if (u <= 65535) {
			len += 3
		} else if (u <= 2097151) {
			len += 4
		} else if (u <= 67108863) {
			len += 5
		} else {
			len += 6
		}
	}
	return len
}

function UTF16ToString(ptr) {
	var i = 0;
	var str = "";
	while (1) {
		var codeUnit = HEAP16[ptr + i * 2 >> 1];
		if (codeUnit == 0) return str;
		++i;
		str += String.fromCharCode(codeUnit)
	}
}

function stringToUTF16(str, outPtr, maxBytesToWrite) {
	if (maxBytesToWrite === undefined) {
		maxBytesToWrite = 2147483647
	}
	if (maxBytesToWrite < 2) return 0;
	maxBytesToWrite -= 2;
	var startPtr = outPtr;
	var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
	for (var i = 0; i < numCharsToWrite; ++i) {
		var codeUnit = str.charCodeAt(i);
		HEAP16[outPtr >> 1] = codeUnit;
		outPtr += 2
	}
	HEAP16[outPtr >> 1] = 0;
	return outPtr - startPtr
}

function lengthBytesUTF16(str) {
	return str.length * 2
}

function UTF32ToString(ptr) {
	var i = 0;
	var str = "";
	while (1) {
		var utf32 = HEAP32[ptr + i * 4 >> 2];
		if (utf32 == 0) return str;
		++i;
		if (utf32 >= 65536) {
			var ch = utf32 - 65536;
			str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
		} else {
			str += String.fromCharCode(utf32)
		}
	}
}

function stringToUTF32(str, outPtr, maxBytesToWrite) {
	if (maxBytesToWrite === undefined) {
		maxBytesToWrite = 2147483647
	}
	if (maxBytesToWrite < 4) return 0;
	var startPtr = outPtr;
	var endPtr = startPtr + maxBytesToWrite - 4;
	for (var i = 0; i < str.length; ++i) {
		var codeUnit = str.charCodeAt(i);
		if (codeUnit >= 55296 && codeUnit <= 57343) {
			var trailSurrogate = str.charCodeAt(++i);
			codeUnit = 65536 + ((codeUnit & 1023) << 10) | trailSurrogate & 1023
		}
		HEAP32[outPtr >> 2] = codeUnit;
		outPtr += 4;
		if (outPtr + 4 > endPtr) break
	}
	HEAP32[outPtr >> 2] = 0;
	return outPtr - startPtr
}

function lengthBytesUTF32(str) {
	var len = 0;
	for (var i = 0; i < str.length; ++i) {
		var codeUnit = str.charCodeAt(i);
		if (codeUnit >= 55296 && codeUnit <= 57343) ++i;
		len += 4
	}
	return len
}

function demangle(func) {
	var hasLibcxxabi = !!Module["___cxa_demangle"];
	if (hasLibcxxabi) {
		try {
			var buf = _malloc(func.length);
			writeStringToMemory(func.substr(1), buf);
			var status = _malloc(4);
			var ret = Module["___cxa_demangle"](buf, 0, 0, status);
			if (getValue(status, "i32") === 0 && ret) {
				return Pointer_stringify(ret)
			}
		} catch (e) {} finally {
			if (buf) _free(buf);
			if (status) _free(status);
			if (ret) _free(ret)
		}
	}
	var i = 3;
	var basicTypes = {
		"v": "void",
		"b": "bool",
		"c": "char",
		"s": "short",
		"i": "int",
		"l": "long",
		"f": "float",
		"d": "double",
		"w": "wchar_t",
		"a": "signed char",
		"h": "unsigned char",
		"t": "unsigned short",
		"j": "unsigned int",
		"m": "unsigned long",
		"x": "long long",
		"y": "unsigned long long",
		"z": "..."
	};
	var subs = [];
	var first = true;

	function dump(x) {
		if (x) Module.print(x);
		Module.print(func);
		var pre = "";
		for (var a = 0; a < i; a++) pre += " ";
		Module.print(pre + "^")
	}

	function parseNested() {
		i++;
		if (func[i] === "K") i++;
		var parts = [];
		while (func[i] !== "E") {
			if (func[i] === "S") {
				i++;
				var next = func.indexOf("_", i);
				var num = func.substring(i, next) || 0;
				parts.push(subs[num] || "?");
				i = next + 1;
				continue
			}
			if (func[i] === "C") {
				parts.push(parts[parts.length - 1]);
				i += 2;
				continue
			}
			var size = parseInt(func.substr(i));
			var pre = size.toString().length;
			if (!size || !pre) {
				i--;
				break
			}
			var curr = func.substr(i + pre, size);
			parts.push(curr);
			subs.push(curr);
			i += pre + size
		}
		i++;
		return parts
	}

	function parse(rawList, limit, allowVoid) {
		limit = limit || Infinity;
		var ret = "",
			list = [];

		function flushList() {
			return "(" + list.join(", ") + ")"
		}
		var name;
		if (func[i] === "N") {
			name = parseNested().join("::");
			limit--;
			if (limit === 0) return rawList ? [name] : name
		} else {
			if (func[i] === "K" || first && func[i] === "L") i++;
			var size = parseInt(func.substr(i));
			if (size) {
				var pre = size.toString().length;
				name = func.substr(i + pre, size);
				i += pre + size
			}
		}
		first = false;
		if (func[i] === "I") {
			i++;
			var iList = parse(true);
			var iRet = parse(true, 1, true);
			ret += iRet[0] + " " + name + "<" + iList.join(", ") + ">"
		} else {
			ret = name
		}
		paramLoop: while (i < func.length && limit-- > 0) {
			var c = func[i++];
			if (c in basicTypes) {
				list.push(basicTypes[c])
			} else {
				switch (c) {
					case "P":
						list.push(parse(true, 1, true)[0] + "*");
						break;
					case "R":
						list.push(parse(true, 1, true)[0] + "&");
						break;
					case "L":
						{
							i++;
							var end = func.indexOf("E", i);
							var size = end - i;list.push(func.substr(i, size));i += size + 2;
							break
						};
					case "A":
						{
							var size = parseInt(func.substr(i));i += size.toString().length;
							if (func[i] !== "_") throw "?";i++;list.push(parse(true, 1, true)[0] + " [" + size + "]");
							break
						};
					case "E":
						break paramLoop;
					default:
						ret += "?" + c;
						break paramLoop
				}
			}
		}
		if (!allowVoid && list.length === 1 && list[0] === "void") list = [];
		if (rawList) {
			if (ret) {
				list.push(ret + "?")
			}
			return list
		} else {
			return ret + flushList()
		}
	}
	var parsed = func;
	try {
		if (func == "Object._main" || func == "_main") {
			return "main()"
		}
		if (typeof func === "number") func = Pointer_stringify(func);
		if (func[0] !== "_") return func;
		if (func[1] !== "_") return func;
		if (func[2] !== "Z") return func;
		switch (func[3]) {
			case "n":
				return "operator new()";
			case "d":
				return "operator delete()"
		}
		parsed = parse()
	} catch (e) {
		parsed += "?"
	}
	if (parsed.indexOf("?") >= 0 && !hasLibcxxabi) {
		Runtime.warnOnce("warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling")
	}
	return parsed
}

function demangleAll(text) {
	return text.replace(/__Z[\w\d_]+/g, (function(x) {
		var y = demangle(x);
		return x === y ? x : x + " [" + y + "]"
	}))
}

function jsStackTrace() {
	var err = new Error;
	if (!err.stack) {
		try {
			throw new Error(0)
		} catch (e) {
			err = e
		}
		if (!err.stack) {
			return "(no stack trace available)"
		}
	}
	return err.stack.toString()
}

function stackTrace() {
	return demangleAll(jsStackTrace())
}
var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
	if (x % 4096 > 0) {
		x += 4096 - x % 4096
	}
	return x
}
var HEAP;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
var STATIC_BASE = 0,
	STATICTOP = 0,
	staticSealed = false;
var STACK_BASE = 0,
	STACKTOP = 0,
	STACK_MAX = 0;
var DYNAMIC_BASE = 0,
	DYNAMICTOP = 0;

function enlargeMemory() {
	abort("Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value " + TOTAL_MEMORY + ", (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.")
}
var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 16777216;
var totalMemory = 64 * 1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) {
	if (totalMemory < 16 * 1024 * 1024) {
		totalMemory *= 2
	} else {
		totalMemory += 16 * 1024 * 1024
	}
}
if (totalMemory !== TOTAL_MEMORY) {
	Module.printErr("increasing TOTAL_MEMORY to " + totalMemory + " to be compliant with the asm.js spec (and given that TOTAL_STACK=" + TOTAL_STACK + ")");
	TOTAL_MEMORY = totalMemory
}
assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && !!(new Int32Array(1))["subarray"] && !!(new Int32Array(1))["set"], "JS engine does not provide full typed array support");
var buffer;
buffer = new ArrayBuffer(TOTAL_MEMORY);
HEAP8 = new Int8Array(buffer);
HEAP16 = new Int16Array(buffer);
HEAP32 = new Int32Array(buffer);
HEAPU8 = new Uint8Array(buffer);
HEAPU16 = new Uint16Array(buffer);
HEAPU32 = new Uint32Array(buffer);
HEAPF32 = new Float32Array(buffer);
HEAPF64 = new Float64Array(buffer);
HEAP32[0] = 255;
assert(HEAPU8[0] === 255 && HEAPU8[3] === 0, "Typed arrays 2 must be run on a little-endian system");
Module["HEAP"] = HEAP;
Module["buffer"] = buffer;
Module["HEAP8"] = HEAP8;
Module["HEAP16"] = HEAP16;
Module["HEAP32"] = HEAP32;
Module["HEAPU8"] = HEAPU8;
Module["HEAPU16"] = HEAPU16;
Module["HEAPU32"] = HEAPU32;
Module["HEAPF32"] = HEAPF32;
Module["HEAPF64"] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
	while (callbacks.length > 0) {
		var callback = callbacks.shift();
		if (typeof callback == "function") {
			callback();
			continue
		}
		var func = callback.func;
		if (typeof func === "number") {
			if (callback.arg === undefined) {
				Runtime.dynCall("v", func)
			} else {
				Runtime.dynCall("vi", func, [callback.arg])
			}
		} else {
			func(callback.arg === undefined ? null : callback.arg)
		}
	}
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;

function preRun() {
	if (Module["preRun"]) {
		if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
		while (Module["preRun"].length) {
			addOnPreRun(Module["preRun"].shift())
		}
	}
	callRuntimeCallbacks(__ATPRERUN__)
}

function ensureInitRuntime() {
	if (runtimeInitialized) return;
	runtimeInitialized = true;
	callRuntimeCallbacks(__ATINIT__)
}

function preMain() {
	callRuntimeCallbacks(__ATMAIN__)
}

function exitRuntime() {
	callRuntimeCallbacks(__ATEXIT__);
	runtimeExited = true
}

function postRun() {
	if (Module["postRun"]) {
		if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
		while (Module["postRun"].length) {
			addOnPostRun(Module["postRun"].shift())
		}
	}
	callRuntimeCallbacks(__ATPOSTRUN__)
}

function addOnPreRun(cb) {
	__ATPRERUN__.unshift(cb)
}

function addOnInit(cb) {
	__ATINIT__.unshift(cb)
}

function addOnPreMain(cb) {
	__ATMAIN__.unshift(cb)
}

function addOnExit(cb) {
	__ATEXIT__.unshift(cb)
}

function addOnPostRun(cb) {
	__ATPOSTRUN__.unshift(cb)
}

function intArrayFromString(stringy, dontAddNull, length) {
	var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
	var u8array = new Array(len);
	var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
	if (dontAddNull) u8array.length = numBytesWritten;
	return u8array
}

function intArrayToString(array) {
	var ret = [];
	for (var i = 0; i < array.length; i++) {
		var chr = array[i];
		if (chr > 255) {
			chr &= 255
		}
		ret.push(String.fromCharCode(chr))
	}
	return ret.join("")
}

function writeStringToMemory(string, buffer, dontAddNull) {
	var array = intArrayFromString(string, dontAddNull);
	var i = 0;
	while (i < array.length) {
		var chr = array[i];
		HEAP8[buffer + i >> 0] = chr;
		i = i + 1
	}
}

function writeArrayToMemory(array, buffer) {
	for (var i = 0; i < array.length; i++) {
		HEAP8[buffer++ >> 0] = array[i]
	}
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
	for (var i = 0; i < str.length; ++i) {
		HEAP8[buffer++ >> 0] = str.charCodeAt(i)
	}
	if (!dontAddNull) HEAP8[buffer >> 0] = 0
}

function unSign(value, bits, ignore) {
	if (value >= 0) {
		return value
	}
	return bits <= 32 ? 2 * Math.abs(1 << bits - 1) + value : Math.pow(2, bits) + value
}

function reSign(value, bits, ignore) {
	if (value <= 0) {
		return value
	}
	var half = bits <= 32 ? Math.abs(1 << bits - 1) : Math.pow(2, bits - 1);
	if (value >= half && (bits <= 32 || value > half)) {
		value = -2 * half + value
	}
	return value
}
if (!Math["imul"] || Math["imul"](4294967295, 5) !== -5) Math["imul"] = function imul(a, b) {
	var ah = a >>> 16;
	var al = a & 65535;
	var bh = b >>> 16;
	var bl = b & 65535;
	return al * bl + (ah * bl + al * bh << 16) | 0
};
Math.imul = Math["imul"];
if (!Math["clz32"]) Math["clz32"] = (function(x) {
	x = x >>> 0;
	for (var i = 0; i < 32; i++) {
		if (x & 1 << 31 - i) return i
	}
	return 32
});
Math.clz32 = Math["clz32"];
var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;

function getUniqueRunDependency(id) {
	return id
}

function addRunDependency(id) {
	runDependencies++;
	if (Module["monitorRunDependencies"]) {
		Module["monitorRunDependencies"](runDependencies)
	}
}

function removeRunDependency(id) {
	runDependencies--;
	if (Module["monitorRunDependencies"]) {
		Module["monitorRunDependencies"](runDependencies)
	}
	if (runDependencies == 0) {
		if (runDependencyWatcher !== null) {
			clearInterval(runDependencyWatcher);
			runDependencyWatcher = null
		}
		if (dependenciesFulfilled) {
			var callback = dependenciesFulfilled;
			dependenciesFulfilled = null;
			callback()
		}
	}
}
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
var memoryInitializer = null;
var ASM_CONSTS = [];
STATIC_BASE = 8;
STATICTOP = STATIC_BASE + 27136;
__ATINIT__.push();
allocate([200, 81, 12, 210, 132, 244, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 200, 81, 12, 210, 132, 244, 239, 63, 246, 149, 7, 233, 41, 210, 239, 63, 218, 211, 196, 241, 50, 153, 239, 63, 212, 253, 16, 217, 15, 74, 239, 63, 126, 159, 187, 110, 91, 229, 238, 63, 97, 193, 63, 157, 217, 107, 238, 63, 29, 215, 241, 37, 117, 222, 237, 63, 106, 127, 111, 236, 60, 62, 237, 63, 201, 234, 53, 193, 96, 140, 236, 63, 119, 36, 69, 1, 46, 202, 235, 63, 30, 188, 126, 218, 11, 249, 234, 63, 58, 208, 191, 52, 119, 26, 234, 63, 245, 37, 35, 128, 254, 47, 233, 63, 242, 64, 67, 131, 61, 59, 232, 63, 14, 7, 83, 222, 216, 61, 231, 63, 247, 242, 175, 163, 121, 57, 230, 63, 76, 200, 197, 32, 201, 47, 229, 63, 206, 184, 120, 145, 108, 34, 228, 63, 255, 153, 90, 25, 1, 19, 227, 63, 47, 156, 49, 237, 23, 3, 226, 63, 99, 217, 6, 205, 50, 244, 224, 63, 77, 90, 134, 114, 129, 207, 223, 63, 205, 143, 100, 251, 53, 190, 221, 63, 21, 198, 55, 144, 5, 183, 219, 63, 224, 7, 173, 168, 61, 188, 217, 63, 96, 51, 10, 147, 243, 207, 215, 63, 243, 29, 252, 196, 1, 244, 213, 63, 74, 133, 103, 248, 5, 42, 212, 63, 231, 205, 60, 20, 96, 115, 210, 63, 141, 202, 52, 55, 50, 209, 208, 63, 216, 209, 122, 240, 193, 136, 206, 63, 175, 39, 120, 18, 42, 155, 203, 63, 200, 72, 147, 222, 121, 218, 200, 63, 181, 207, 91, 35, 31, 71, 198, 63, 61, 87, 66, 20, 31, 225, 195, 63, 181, 205, 1, 64, 29, 168, 193, 63, 77, 186, 144, 187, 198, 54, 191, 63, 46, 12, 38, 56, 212, 115, 187, 63, 102, 146, 5, 10, 196, 4, 184, 63, 128, 84, 22, 199, 121, 230, 180, 63, 98, 72, 78, 38, 110, 21, 178, 63, 164, 21, 132, 151, 133, 27, 175, 63, 236, 178, 235, 32, 167, 150, 170, 63, 151, 168, 65, 69, 147, 147, 166, 63, 62, 120, 47, 239, 88, 9, 163, 63, 213, 231, 172, 71, 200, 221, 159, 63, 108, 207, 77, 23, 57, 118, 154, 63, 244, 241, 216, 232, 255, 201, 149, 63, 15, 11, 181, 166, 121, 199, 145, 63, 85, 23, 108, 250, 30, 187, 140, 63, 254, 164, 177, 40, 178, 247, 134, 63, 60, 183, 150, 234, 126, 37, 130, 63, 165, 251, 181, 204, 84, 78, 124, 63, 103, 31, 84, 119, 159, 194, 117, 63, 5, 196, 127, 21, 59, 117, 112, 63, 116, 127, 179, 156, 157, 111, 104, 63, 211, 240, 243, 0, 146, 192, 97, 63, 247, 82, 219, 250, 167, 35, 89, 63, 63, 193, 172, 237, 121, 64, 81, 63, 241, 66, 0, 145, 250, 194, 70, 63, 123, 178, 205, 83, 62, 128, 60, 63, 38, 81, 146, 34, 240, 143, 48, 63, 199, 84, 110, 96, 122, 20, 33, 63, 125, 137, 127, 55, 32, 171, 11, 63, 241, 104, 227, 136, 181, 248, 228, 62, 0, 0, 0, 0, 0, 0, 0, 0, 185, 166, 163, 144, 34, 218, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 185, 166, 163, 144, 34, 218, 239, 63, 133, 11, 22, 218, 123, 105, 239, 63, 68, 70, 205, 120, 215, 176, 238, 63, 38, 83, 195, 134, 192, 180, 237, 63, 51, 218, 46, 93, 86, 123, 236, 63, 169, 206, 23, 57, 19, 12, 235, 63, 169, 234, 113, 33, 135, 111, 233, 63, 114, 230, 145, 30, 10, 175, 231, 63, 214, 209, 105, 196, 105, 212, 229, 63, 192, 167, 164, 20, 149, 233, 227, 63, 57, 160, 0, 229, 74, 248, 225, 63, 234, 131, 27, 223, 205, 9, 224, 63, 85, 106, 213, 50, 66, 77, 220, 63, 67, 93, 222, 251, 159, 172, 216, 63, 15, 90, 246, 193, 133, 62, 213, 63, 31, 5, 219, 202, 67, 13, 210, 63, 160, 103, 55, 35, 24, 65, 206, 63, 140, 139, 122, 243, 225, 250, 200, 63, 240, 174, 72, 134, 251, 76, 196, 63, 116, 227, 39, 31, 204, 55, 192, 63, 238, 97, 138, 205, 34, 111, 185, 63, 59, 78, 85, 202, 0, 138, 179, 63, 232, 97, 46, 202, 232, 87, 173, 63, 36, 51, 205, 42, 34, 121, 165, 63, 187, 105, 109, 249, 204, 130, 158, 63, 34, 44, 116, 111, 143, 239, 148, 63, 62, 17, 221, 22, 217, 140, 139, 63, 93, 194, 95, 155, 166, 50, 129, 63, 80, 8, 178, 216, 5, 7, 116, 63, 129, 200, 42, 190, 4, 27, 101, 63, 220, 238, 171, 147, 175, 219, 82, 63, 27, 202, 154, 162, 109, 70, 55, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 193, 83, 76, 206, 30, 226, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 193, 83, 76, 206, 30, 226, 239, 63, 207, 66, 200, 154, 13, 137, 239, 63, 12, 109, 231, 152, 127, 246, 238, 63, 136, 18, 45, 121, 60, 45, 238, 63, 154, 77, 244, 183, 12, 49, 237, 63, 181, 176, 192, 186, 158, 6, 236, 63, 204, 153, 14, 25, 102, 179, 234, 63, 220, 121, 44, 199, 117, 61, 233, 63, 81, 171, 34, 187, 86, 171, 231, 63, 149, 54, 201, 77, 220, 3, 230, 63, 117, 171, 231, 164, 247, 77, 228, 63, 119, 0, 155, 222, 139, 144, 226, 63, 19, 129, 234, 31, 68, 210, 224, 63, 198, 0, 195, 209, 217, 50, 222, 63, 83, 62, 4, 85, 163, 215, 218, 63, 217, 8, 97, 193, 63, 157, 215, 63, 168, 106, 6, 225, 159, 140, 212, 63, 110, 36, 125, 24, 41, 173, 209, 63, 90, 239, 121, 246, 67, 9, 206, 63, 27, 0, 96, 43, 87, 46, 201, 63, 81, 150, 107, 27, 144, 206, 196, 63, 139, 236, 90, 173, 217, 235, 192, 63, 233, 214, 41, 94, 126, 10, 187, 63, 223, 23, 250, 212, 111, 46, 181, 63, 6, 13, 129, 76, 0, 56, 176, 63, 202, 189, 68, 229, 244, 47, 168, 63, 166, 21, 248, 237, 152, 120, 161, 63, 75, 245, 83, 210, 121, 67, 152, 63, 148, 207, 159, 244, 141, 1, 144, 63, 0, 110, 55, 61, 255, 168, 131, 63, 222, 105, 25, 70, 205, 153, 117, 63, 224, 133, 140, 203, 225, 40, 99, 63, 252, 169, 241, 210, 77, 98, 64, 63, 0, 0, 0, 0, 0, 0, 0, 0, 37, 145, 224, 186, 32, 234, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 37, 145, 224, 186, 32, 234, 239, 63, 222, 75, 43, 207, 205, 168, 239, 63, 90, 31, 255, 154, 230, 60, 239, 63, 85, 207, 23, 181, 218, 167, 238, 63, 190, 160, 100, 246, 162, 235, 237, 63, 215, 144, 110, 58, 184, 10, 237, 63, 139, 232, 207, 101, 7, 8, 236, 63, 181, 222, 111, 180, 227, 230, 234, 63, 88, 0, 116, 20, 247, 170, 233, 63, 34, 114, 85, 52, 49, 88, 232, 63, 80, 197, 174, 105, 181, 242, 230, 63, 88, 228, 182, 1, 200, 126, 229, 63, 148, 69, 39, 108, 187, 0, 228, 63, 71, 43, 74, 75, 221, 124, 226, 63, 169, 163, 227, 106, 100, 247, 224, 63, 170, 169, 151, 165, 190, 232, 222, 63, 22, 196, 122, 130, 72, 239, 219, 63, 75, 102, 204, 143, 133, 9, 217, 63, 63, 233, 225, 87, 238, 61, 214, 63, 194, 106, 110, 125, 63, 146, 211, 63, 160, 190, 167, 106, 105, 11, 209, 63, 43, 114, 95, 57, 8, 91, 205, 63, 39, 153, 98, 47, 144, 247, 200, 63, 161, 7, 202, 175, 23, 241, 196, 63, 202, 98, 172, 128, 140, 74, 193, 63, 34, 197, 190, 108, 84, 10, 188, 63, 97, 133, 0, 133, 31, 65, 182, 63, 143, 222, 112, 31, 185, 53, 177, 63, 67, 132, 201, 158, 78, 195, 169, 63, 33, 123, 123, 223, 17, 120, 162, 63, 243, 71, 40, 232, 188, 231, 152, 63, 89, 237, 14, 231, 233, 117, 142, 63, 33, 2, 14, 161, 74, 205, 126, 63, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 7, 0, 0, 0, 12, 0, 0, 0, 3, 0, 0, 0, 11, 0, 0, 0, 4, 0, 0, 0, 14, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0, 6, 0, 0, 0, 13, 0, 0, 0, 2, 0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 0, 0, 0, 157, 62, 0, 64, 94, 62, 0, 192, 4, 62, 0, 128, 237, 62, 0, 64, 137, 62, 0, 0, 0, 0, 0, 192, 76, 63, 0, 0, 205, 61, 0, 0, 0, 0, 96, 6, 0, 0, 32, 9, 0, 0, 220, 11, 0, 0, 148, 14, 0, 0, 72, 17, 0, 0, 248, 19, 0, 0, 164, 22, 0, 0, 12, 24, 0, 0, 200, 24, 0, 0, 60, 25, 0, 0, 136, 25, 0, 0, 192, 25, 0, 0, 224, 25, 0, 0, 248, 25, 0, 0, 4, 26, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 7, 0, 0, 0, 9, 0, 0, 0, 11, 0, 0, 0, 13, 0, 0, 0, 15, 0, 0, 0, 17, 0, 0, 0, 19, 0, 0, 0, 21, 0, 0, 0, 23, 0, 0, 0, 25, 0, 0, 0, 27, 0, 0, 0, 29, 0, 0, 0, 31, 0, 0, 0, 33, 0, 0, 0, 35, 0, 0, 0, 37, 0, 0, 0, 39, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 49, 0, 0, 0, 51, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0, 57, 0, 0, 0, 59, 0, 0, 0, 61, 0, 0, 0, 63, 0, 0, 0, 65, 0, 0, 0, 67, 0, 0, 0, 69, 0, 0, 0, 71, 0, 0, 0, 73, 0, 0, 0, 75, 0, 0, 0, 77, 0, 0, 0, 79, 0, 0, 0, 81, 0, 0, 0, 83, 0, 0, 0, 85, 0, 0, 0, 87, 0, 0, 0, 89, 0, 0, 0, 91, 0, 0, 0, 93, 0, 0, 0, 95, 0, 0, 0, 97, 0, 0, 0, 99, 0, 0, 0, 101, 0, 0, 0, 103, 0, 0, 0, 105, 0, 0, 0, 107, 0, 0, 0, 109, 0, 0, 0, 111, 0, 0, 0, 113, 0, 0, 0, 115, 0, 0, 0, 117, 0, 0, 0, 119, 0, 0, 0, 121, 0, 0, 0, 123, 0, 0, 0, 125, 0, 0, 0, 127, 0, 0, 0, 129, 0, 0, 0, 131, 0, 0, 0, 133, 0, 0, 0, 135, 0, 0, 0, 137, 0, 0, 0, 139, 0, 0, 0, 141, 0, 0, 0, 143, 0, 0, 0, 145, 0, 0, 0, 147, 0, 0, 0, 149, 0, 0, 0, 151, 0, 0, 0, 153, 0, 0, 0, 155, 0, 0, 0, 157, 0, 0, 0, 159, 0, 0, 0, 161, 0, 0, 0, 163, 0, 0, 0, 165, 0, 0, 0, 167, 0, 0, 0, 169, 0, 0, 0, 171, 0, 0, 0, 173, 0, 0, 0, 175, 0, 0, 0, 177, 0, 0, 0, 179, 0, 0, 0, 181, 0, 0, 0, 183, 0, 0, 0, 185, 0, 0, 0, 187, 0, 0, 0, 189, 0, 0, 0, 191, 0, 0, 0, 193, 0, 0, 0, 195, 0, 0, 0, 197, 0, 0, 0, 199, 0, 0, 0, 201, 0, 0, 0, 203, 0, 0, 0, 205, 0, 0, 0, 207, 0, 0, 0, 209, 0, 0, 0, 211, 0, 0, 0, 213, 0, 0, 0, 215, 0, 0, 0, 217, 0, 0, 0, 219, 0, 0, 0, 221, 0, 0, 0, 223, 0, 0, 0, 225, 0, 0, 0, 227, 0, 0, 0, 229, 0, 0, 0, 231, 0, 0, 0, 233, 0, 0, 0, 235, 0, 0, 0, 237, 0, 0, 0, 239, 0, 0, 0, 241, 0, 0, 0, 243, 0, 0, 0, 245, 0, 0, 0, 247, 0, 0, 0, 249, 0, 0, 0, 251, 0, 0, 0, 253, 0, 0, 0, 255, 0, 0, 0, 1, 1, 0, 0, 3, 1, 0, 0, 5, 1, 0, 0, 7, 1, 0, 0, 9, 1, 0, 0, 11, 1, 0, 0, 13, 1, 0, 0, 15, 1, 0, 0, 17, 1, 0, 0, 19, 1, 0, 0, 21, 1, 0, 0, 23, 1, 0, 0, 25, 1, 0, 0, 27, 1, 0, 0, 29, 1, 0, 0, 31, 1, 0, 0, 33, 1, 0, 0, 35, 1, 0, 0, 37, 1, 0, 0, 39, 1, 0, 0, 41, 1, 0, 0, 43, 1, 0, 0, 45, 1, 0, 0, 47, 1, 0, 0, 49, 1, 0, 0, 51, 1, 0, 0, 53, 1, 0, 0, 55, 1, 0, 0, 57, 1, 0, 0, 59, 1, 0, 0, 61, 1, 0, 0, 63, 1, 0, 0, 65, 1, 0, 0, 67, 1, 0, 0, 69, 1, 0, 0, 71, 1, 0, 0, 73, 1, 0, 0, 75, 1, 0, 0, 77, 1, 0, 0, 79, 1, 0, 0, 81, 1, 0, 0, 83, 1, 0, 0, 85, 1, 0, 0, 87, 1, 0, 0, 89, 1, 0, 0, 91, 1, 0, 0, 93, 1, 0, 0, 95, 1, 0, 0, 13, 0, 0, 0, 25, 0, 0, 0, 41, 0, 0, 0, 61, 0, 0, 0, 85, 0, 0, 0, 113, 0, 0, 0, 145, 0, 0, 0, 181, 0, 0, 0, 221, 0, 0, 0, 9, 1, 0, 0, 57, 1, 0, 0, 109, 1, 0, 0, 165, 1, 0, 0, 225, 1, 0, 0, 33, 2, 0, 0, 101, 2, 0, 0, 173, 2, 0, 0, 249, 2, 0, 0, 73, 3, 0, 0, 157, 3, 0, 0, 245, 3, 0, 0, 81, 4, 0, 0, 177, 4, 0, 0, 21, 5, 0, 0, 125, 5, 0, 0, 233, 5, 0, 0, 89, 6, 0, 0, 205, 6, 0, 0, 69, 7, 0, 0, 193, 7, 0, 0, 65, 8, 0, 0, 197, 8, 0, 0, 77, 9, 0, 0, 217, 9, 0, 0, 105, 10, 0, 0, 253, 10, 0, 0, 149, 11, 0, 0, 49, 12, 0, 0, 209, 12, 0, 0, 117, 13, 0, 0, 29, 14, 0, 0, 201, 14, 0, 0, 121, 15, 0, 0, 45, 16, 0, 0, 229, 16, 0, 0, 161, 17, 0, 0, 97, 18, 0, 0, 37, 19, 0, 0, 237, 19, 0, 0, 185, 20, 0, 0, 137, 21, 0, 0, 93, 22, 0, 0, 53, 23, 0, 0, 17, 24, 0, 0, 241, 24, 0, 0, 213, 25, 0, 0, 189, 26, 0, 0, 169, 27, 0, 0, 153, 28, 0, 0, 141, 29, 0, 0, 133, 30, 0, 0, 129, 31, 0, 0, 129, 32, 0, 0, 133, 33, 0, 0, 141, 34, 0, 0, 153, 35, 0, 0, 169, 36, 0, 0, 189, 37, 0, 0, 213, 38, 0, 0, 241, 39, 0, 0, 17, 41, 0, 0, 53, 42, 0, 0, 93, 43, 0, 0, 137, 44, 0, 0, 185, 45, 0, 0, 237, 46, 0, 0, 37, 48, 0, 0, 97, 49, 0, 0, 161, 50, 0, 0, 229, 51, 0, 0, 45, 53, 0, 0, 121, 54, 0, 0, 201, 55, 0, 0, 29, 57, 0, 0, 117, 58, 0, 0, 209, 59, 0, 0, 49, 61, 0, 0, 149, 62, 0, 0, 253, 63, 0, 0, 105, 65, 0, 0, 217, 66, 0, 0, 77, 68, 0, 0, 197, 69, 0, 0, 65, 71, 0, 0, 193, 72, 0, 0, 69, 74, 0, 0, 205, 75, 0, 0, 89, 77, 0, 0, 233, 78, 0, 0, 125, 80, 0, 0, 21, 82, 0, 0, 177, 83, 0, 0, 81, 85, 0, 0, 245, 86, 0, 0, 157, 88, 0, 0, 73, 90, 0, 0, 249, 91, 0, 0, 173, 93, 0, 0, 101, 95, 0, 0, 33, 97, 0, 0, 225, 98, 0, 0, 165, 100, 0, 0, 109, 102, 0, 0, 57, 104, 0, 0, 9, 106, 0, 0, 221, 107, 0, 0, 181, 109, 0, 0, 145, 111, 0, 0, 113, 113, 0, 0, 85, 115, 0, 0, 61, 117, 0, 0, 41, 119, 0, 0, 25, 121, 0, 0, 13, 123, 0, 0, 5, 125, 0, 0, 1, 127, 0, 0, 1, 129, 0, 0, 5, 131, 0, 0, 13, 133, 0, 0, 25, 135, 0, 0, 41, 137, 0, 0, 61, 139, 0, 0, 85, 141, 0, 0, 113, 143, 0, 0, 145, 145, 0, 0, 181, 147, 0, 0, 221, 149, 0, 0, 9, 152, 0, 0, 57, 154, 0, 0, 109, 156, 0, 0, 165, 158, 0, 0, 225, 160, 0, 0, 33, 163, 0, 0, 101, 165, 0, 0, 173, 167, 0, 0, 249, 169, 0, 0, 73, 172, 0, 0, 157, 174, 0, 0, 245, 176, 0, 0, 81, 179, 0, 0, 177, 181, 0, 0, 21, 184, 0, 0, 125, 186, 0, 0, 233, 188, 0, 0, 89, 191, 0, 0, 205, 193, 0, 0, 69, 196, 0, 0, 193, 198, 0, 0, 65, 201, 0, 0, 197, 203, 0, 0, 77, 206, 0, 0, 217, 208, 0, 0, 105, 211, 0, 0, 253, 213, 0, 0, 149, 216, 0, 0, 49, 219, 0, 0, 209, 221, 0, 0, 117, 224, 0, 0, 29, 227, 0, 0, 201, 229, 0, 0, 121, 232, 0, 0, 45, 235, 0, 0, 229, 237, 0, 0, 161, 240, 0, 0, 63, 0, 0, 0, 129, 0, 0, 0, 231, 0, 0, 0, 121, 1, 0, 0, 63, 2, 0, 0, 65, 3, 0, 0, 135, 4, 0, 0, 25, 6, 0, 0, 255, 7, 0, 0, 65, 10, 0, 0, 231, 12, 0, 0, 249, 15, 0, 0, 127, 19, 0, 0, 129, 23, 0, 0, 7, 28, 0, 0, 25, 33, 0, 0, 191, 38, 0, 0, 1, 45, 0, 0, 231, 51, 0, 0, 121, 59, 0, 0, 191, 67, 0, 0, 193, 76, 0, 0, 135, 86, 0, 0, 25, 97, 0, 0, 127, 108, 0, 0, 193, 120, 0, 0, 231, 133, 0, 0, 249, 147, 0, 0, 255, 162, 0, 0, 1, 179, 0, 0, 7, 196, 0, 0, 25, 214, 0, 0, 63, 233, 0, 0, 129, 253, 0, 0, 231, 18, 1, 0, 121, 41, 1, 0, 63, 65, 1, 0, 65, 90, 1, 0, 135, 116, 1, 0, 25, 144, 1, 0, 255, 172, 1, 0, 65, 203, 1, 0, 231, 234, 1, 0, 249, 11, 2, 0, 127, 46, 2, 0, 129, 82, 2, 0, 7, 120, 2, 0, 25, 159, 2, 0, 191, 199, 2, 0, 1, 242, 2, 0, 231, 29, 3, 0, 121, 75, 3, 0, 191, 122, 3, 0, 193, 171, 3, 0, 135, 222, 3, 0, 25, 19, 4, 0, 127, 73, 4, 0, 193, 129, 4, 0, 231, 187, 4, 0, 249, 247, 4, 0, 255, 53, 5, 0, 1, 118, 5, 0, 7, 184, 5, 0, 25, 252, 5, 0, 63, 66, 6, 0, 129, 138, 6, 0, 231, 212, 6, 0, 121, 33, 7, 0, 63, 112, 7, 0, 65, 193, 7, 0, 135, 20, 8, 0, 25, 106, 8, 0, 255, 193, 8, 0, 65, 28, 9, 0, 231, 120, 9, 0, 249, 215, 9, 0, 127, 57, 10, 0, 129, 157, 10, 0, 7, 4, 11, 0, 25, 109, 11, 0, 191, 216, 11, 0, 1, 71, 12, 0, 231, 183, 12, 0, 121, 43, 13, 0, 191, 161, 13, 0, 193, 26, 14, 0, 135, 150, 14, 0, 25, 21, 15, 0, 127, 150, 15, 0, 193, 26, 16, 0, 231, 161, 16, 0, 249, 43, 17, 0, 255, 184, 17, 0, 1, 73, 18, 0, 7, 220, 18, 0, 25, 114, 19, 0, 63, 11, 20, 0, 129, 167, 20, 0, 231, 70, 21, 0, 121, 233, 21, 0, 63, 143, 22, 0, 65, 56, 23, 0, 135, 228, 23, 0, 25, 148, 24, 0, 255, 70, 25, 0, 65, 253, 25, 0, 231, 182, 26, 0, 249, 115, 27, 0, 127, 52, 28, 0, 129, 248, 28, 0, 7, 192, 29, 0, 25, 139, 30, 0, 191, 89, 31, 0, 1, 44, 32, 0, 231, 1, 33, 0, 121, 219, 33, 0, 191, 184, 34, 0, 193, 153, 35, 0, 135, 126, 36, 0, 25, 103, 37, 0, 127, 83, 38, 0, 193, 67, 39, 0, 231, 55, 40, 0, 249, 47, 41, 0, 255, 43, 42, 0, 1, 44, 43, 0, 7, 48, 44, 0, 25, 56, 45, 0, 63, 68, 46, 0, 129, 84, 47, 0, 231, 104, 48, 0, 121, 129, 49, 0, 63, 158, 50, 0, 65, 191, 51, 0, 135, 228, 52, 0, 25, 14, 54, 0, 255, 59, 55, 0, 65, 110, 56, 0, 231, 164, 57, 0, 249, 223, 58, 0, 127, 31, 60, 0, 129, 99, 61, 0, 7, 172, 62, 0, 25, 249, 63, 0, 191, 74, 65, 0, 1, 161, 66, 0, 231, 251, 67, 0, 121, 91, 69, 0, 191, 191, 70, 0, 193, 40, 72, 0, 135, 150, 73, 0, 25, 9, 75, 0, 127, 128, 76, 0, 193, 252, 77, 0, 231, 125, 79, 0, 249, 3, 81, 0, 255, 142, 82, 0, 1, 31, 84, 0, 7, 180, 85, 0, 25, 78, 87, 0, 63, 237, 88, 0, 129, 145, 90, 0, 231, 58, 92, 0, 121, 233, 93, 0, 63, 157, 95, 0, 65, 86, 97, 0, 135, 20, 99, 0, 25, 216, 100, 0, 255, 160, 102, 0, 65, 111, 104, 0, 231, 66, 106, 0, 249, 27, 108, 0, 127, 250, 109, 0, 65, 1, 0, 0, 169, 2, 0, 0, 9, 5, 0, 0, 193, 8, 0, 0, 65, 14, 0, 0, 9, 22, 0, 0, 169, 32, 0, 0, 193, 46, 0, 0, 1, 65, 0, 0, 41, 88, 0, 0, 9, 117, 0, 0, 129, 152, 0, 0, 129, 195, 0, 0, 9, 247, 0, 0, 41, 52, 1, 0, 1, 124, 1, 0, 193, 207, 1, 0, 169, 48, 2, 0, 9, 160, 2, 0, 65, 31, 3, 0, 193, 175, 3, 0, 9, 83, 4, 0, 169, 10, 5, 0, 65, 216, 5, 0, 129, 189, 6, 0, 41, 188, 7, 0, 9, 214, 8, 0, 1, 13, 10, 0, 1, 99, 11, 0, 9, 218, 12, 0, 41, 116, 14, 0, 129, 51, 16, 0, 65, 26, 18, 0, 169, 42, 20, 0, 9, 103, 22, 0, 193, 209, 24, 0, 65, 109, 27, 0, 9, 60, 30, 0, 169, 64, 33, 0, 193, 125, 36, 0, 1, 246, 39, 0, 41, 172, 43, 0, 9, 163, 47, 0, 129, 221, 51, 0, 129, 94, 56, 0, 9, 41, 61, 0, 41, 64, 66, 0, 1, 167, 71, 0, 193, 96, 77, 0, 169, 112, 83, 0, 9, 218, 89, 0, 65, 160, 96, 0, 193, 198, 103, 0, 9, 81, 111, 0, 169, 66, 119, 0, 65, 159, 127, 0, 129, 106, 136, 0, 41, 168, 145, 0, 9, 92, 155, 0, 1, 138, 165, 0, 1, 54, 176, 0, 9, 100, 187, 0, 41, 24, 199, 0, 129, 86, 211, 0, 65, 35, 224, 0, 169, 130, 237, 0, 9, 121, 251, 0, 193, 10, 10, 1, 65, 60, 25, 1, 9, 18, 41, 1, 169, 144, 57, 1, 193, 188, 74, 1, 1, 155, 92, 1, 41, 48, 111, 1, 9, 129, 130, 1, 129, 146, 150, 1, 129, 105, 171, 1, 9, 11, 193, 1, 41, 124, 215, 1, 1, 194, 238, 1, 193, 225, 6, 2, 169, 224, 31, 2, 9, 196, 57, 2, 65, 145, 84, 2, 193, 77, 112, 2, 9, 255, 140, 2, 169, 170, 170, 2, 65, 86, 201, 2, 129, 7, 233, 2, 41, 196, 9, 3, 9, 146, 43, 3, 1, 119, 78, 3, 1, 121, 114, 3, 9, 158, 151, 3, 41, 236, 189, 3, 129, 105, 229, 3, 65, 28, 14, 4, 169, 10, 56, 4, 9, 59, 99, 4, 193, 179, 143, 4, 65, 123, 189, 4, 9, 152, 236, 4, 169, 16, 29, 5, 193, 235, 78, 5, 1, 48, 130, 5, 41, 228, 182, 5, 9, 15, 237, 5, 129, 183, 36, 6, 129, 228, 93, 6, 9, 157, 152, 6, 41, 232, 212, 6, 1, 205, 18, 7, 193, 82, 82, 7, 169, 128, 147, 7, 9, 94, 214, 7, 65, 242, 26, 8, 193, 68, 97, 8, 9, 93, 169, 8, 169, 66, 243, 8, 65, 253, 62, 9, 129, 148, 140, 9, 41, 16, 220, 9, 9, 120, 45, 10, 1, 212, 128, 10, 1, 44, 214, 10, 9, 136, 45, 11, 41, 240, 134, 11, 129, 108, 226, 11, 65, 5, 64, 12, 169, 194, 159, 12, 9, 173, 1, 13, 193, 204, 101, 13, 65, 42, 204, 13, 9, 206, 52, 14, 169, 192, 159, 14, 193, 10, 13, 15, 1, 181, 124, 15, 41, 200, 238, 15, 9, 77, 99, 16, 129, 76, 218, 16, 129, 207, 83, 17, 9, 223, 207, 17, 41, 132, 78, 18, 1, 200, 207, 18, 193, 179, 83, 19, 169, 80, 218, 19, 9, 168, 99, 20, 65, 195, 239, 20, 193, 171, 126, 21, 9, 107, 16, 22, 169, 10, 165, 22, 65, 148, 60, 23, 129, 17, 215, 23, 41, 140, 116, 24, 9, 14, 21, 25, 1, 161, 184, 25, 1, 79, 95, 26, 9, 34, 9, 27, 41, 36, 182, 27, 129, 95, 102, 28, 65, 222, 25, 29, 169, 170, 208, 29, 9, 207, 138, 30, 193, 85, 72, 31, 65, 73, 9, 32, 9, 180, 205, 32, 169, 160, 149, 33, 193, 25, 97, 34, 1, 42, 48, 35, 41, 220, 2, 36, 9, 59, 217, 36, 129, 81, 179, 37, 147, 6, 0, 0, 69, 14, 0, 0, 15, 28, 0, 0, 17, 51, 0, 0, 91, 87, 0, 0, 13, 142, 0, 0, 119, 221, 0, 0, 57, 77, 1, 0, 99, 230, 1, 0, 149, 179, 2, 0, 31, 193, 3, 0, 33, 29, 5, 0, 171, 215, 6, 0, 221, 2, 9, 0, 7, 179, 11, 0, 201, 254, 14, 0, 51, 255, 18, 0, 229, 207, 23, 0, 47, 143, 29, 0, 49, 94, 36, 0, 251, 96, 44, 0, 173, 190, 53, 0, 151, 161, 64, 0, 89, 55, 77, 0, 3, 177, 91, 0, 53, 67, 108, 0, 63, 38, 127, 0, 65, 150, 148, 0, 75, 211, 172, 0, 125, 33, 200, 0, 39, 201, 230, 0, 233, 22, 9, 1, 211, 91, 47, 1, 133, 237, 89, 1, 79, 38, 137, 1, 81, 101, 189, 1, 155, 14, 247, 1, 77, 139, 54, 2, 183, 73, 124, 2, 121, 189, 200, 2, 163, 95, 28, 3, 213, 174, 119, 3, 95, 47, 219, 3, 97, 107, 71, 4, 235, 242, 188, 4, 29, 92, 60, 5, 71, 67, 198, 5, 9, 75, 91, 6, 115, 28, 252, 6, 37, 103, 169, 7, 111, 225, 99, 8, 113, 72, 44, 9, 59, 96, 3, 10, 237, 243, 233, 10, 215, 213, 224, 11, 153, 223, 232, 12, 67, 242, 2, 14, 117, 246, 47, 15, 127, 220, 112, 16, 129, 156, 198, 17, 139, 54, 50, 19, 189, 178, 180, 20, 103, 33, 79, 22, 41, 155, 2, 24, 19, 65, 208, 25, 197, 60, 185, 27, 143, 192, 190, 29, 145, 7, 226, 31, 219, 85, 36, 34, 141, 248, 134, 36, 247, 69, 11, 39, 185, 157, 178, 41, 227, 104, 126, 44, 21, 26, 112, 47, 159, 45, 137, 50, 161, 41, 203, 53, 43, 158, 55, 57, 93, 37, 208, 60, 135, 99, 150, 64, 73, 7, 140, 68, 179, 201, 178, 72, 101, 110, 12, 77, 175, 195, 154, 81, 177, 162, 95, 86, 123, 239, 92, 91, 45, 153, 148, 96, 23, 154, 8, 102, 217, 247, 186, 107, 131, 195, 173, 113, 181, 25, 227, 119, 191, 34, 93, 126, 29, 35, 0, 0, 113, 77, 0, 0, 145, 156, 0, 0, 253, 38, 1, 0, 101, 12, 2, 0, 233, 119, 3, 0, 153, 162, 5, 0, 53, 214, 8, 0, 45, 112, 13, 0, 225, 228, 19, 0, 33, 195, 28, 0, 237, 183, 40, 0, 117, 146, 56, 0, 89, 72, 77, 0, 41, 250, 103, 0, 37, 248, 137, 0, 61, 199, 180, 0, 81, 38, 234, 0, 177, 19, 44, 1, 221, 210, 124, 1, 133, 242, 222, 1, 201, 82, 85, 2, 185, 43, 227, 2, 21, 20, 140, 3, 77, 8, 84, 4, 193, 113, 63, 5, 65, 46, 83, 6, 205, 151, 148, 7, 149, 140, 9, 9, 57, 119, 184, 10, 73, 87, 168, 12, 5, 202, 224, 14, 93, 19, 106, 17, 49, 39, 77, 20, 209, 178, 147, 23, 189, 38, 72, 27, 165, 192, 117, 31, 169, 149, 40, 36, 217, 156, 109, 41, 245, 185, 82, 47, 109, 200, 230, 53, 161, 166, 57, 61, 97, 65, 92, 69, 173, 159, 96, 78, 181, 238, 89, 88, 25, 142, 92, 99, 105, 28, 126, 111, 229, 131, 213, 124, 255, 189, 0, 0, 1, 168, 1, 0, 143, 107, 3, 0, 241, 158, 6, 0, 63, 35, 12, 0, 193, 61, 21, 0, 143, 182, 35, 0, 241, 252, 57, 0, 255, 81, 91, 0, 1, 250, 139, 0, 15, 117, 209, 0, 113, 191, 50, 1, 63, 154, 184, 1, 193, 220, 109, 2, 15, 207, 95, 3, 113, 142, 158, 4, 255, 123, 61, 6, 1, 182, 83, 8, 143, 156, 252, 10, 241, 97, 88, 14, 63, 167, 140, 18, 193, 37, 197, 23, 143, 101, 52, 30, 241, 129, 20, 38, 255, 251, 167, 47, 1, 156, 58, 59, 15, 98, 34, 73, 113, 134, 192, 89, 63, 138, 130, 109, 193, 88, 227, 132, 1, 14, 4, 0, 145, 33, 9, 0, 17, 44, 19, 0, 65, 238, 37, 0, 65, 79, 71, 0, 145, 67, 128, 0, 17, 247, 221, 0, 1, 70, 115, 1, 1, 146, 90, 2, 17, 1, 184, 3, 145, 53, 188, 5, 65, 143, 167, 8, 65, 6, 206, 12, 17, 178, 155, 18, 145, 15, 154, 26, 1, 26, 118, 37, 1, 76, 7, 52, 145, 158, 87, 71, 17, 157, 172, 96, 65, 166, 145, 129, 35, 81, 22, 0, 197, 158, 50, 0, 23, 185, 107, 0, 153, 246, 216, 0, 107, 137, 160, 1, 13, 196, 254, 2, 31, 1, 80, 5, 33, 217, 29, 9, 51, 108, 48, 15, 213, 162, 164, 24, 167, 103, 8, 39, 41, 253, 125, 60, 123, 181, 231, 91, 29, 119, 29, 137, 175, 160, 45, 201, 173, 142, 123, 0, 137, 230, 25, 1, 57, 150, 94, 2, 61, 22, 216, 4, 181, 99, 119, 9, 225, 40, 198, 17, 33, 3, 52, 32, 117, 72, 130, 56, 125, 87, 87, 96, 191, 91, 175, 2, 129, 216, 39, 6, 247, 132, 94, 13, 233, 254, 173, 27, 127, 139, 235, 54, 129, 183, 229, 104, 23, 3, 156, 193, 193, 12, 255, 14, 57, 106, 133, 34, 25, 238, 145, 75, 129, 120, 43, 158, 51, 225, 9, 84, 149, 139, 0, 0, 55, 152, 0, 0, 255, 165, 0, 0, 4, 181, 0, 0, 103, 197, 0, 0, 69, 215, 0, 0, 193, 234, 0, 0, 255, 255, 0, 0, 100, 26, 0, 0, 128, 187, 0, 0, 120, 0, 0, 0, 21, 0, 0, 0, 21, 0, 0, 0, 0, 154, 89, 63, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 128, 63, 208, 76, 0, 0, 3, 0, 0, 0, 8, 0, 0, 0, 120, 0, 0, 0, 11, 0, 0, 0, 28, 88, 0, 0, 252, 76, 0, 0, 208, 26, 0, 0, 128, 7, 0, 0, 3, 0, 0, 0, 176, 28, 0, 0, 228, 28, 0, 0, 24, 29, 0, 0, 76, 29, 0, 0, 128, 29, 0, 0, 136, 1, 0, 0, 38, 77, 0, 0, 3, 89, 0, 0, 139, 90, 0, 0, 106, 28, 141, 56, 82, 187, 30, 58, 8, 105, 220, 58, 130, 237, 87, 59, 137, 99, 178, 59, 3, 42, 5, 60, 48, 220, 57, 60, 180, 62, 119, 60, 28, 163, 158, 60, 209, 242, 197, 60, 254, 134, 241, 60, 155, 171, 16, 61, 5, 173, 42, 61, 132, 194, 70, 61, 83, 230, 100, 61, 17, 137, 130, 61, 135, 159, 147, 61, 203, 178, 165, 61, 209, 190, 184, 61, 58, 191, 204, 61, 84, 175, 225, 61, 20, 138, 247, 61, 14, 37, 7, 62, 217, 244, 18, 62, 95, 49, 31, 62, 104, 215, 43, 62, 138, 227, 56, 62, 48, 82, 70, 62, 148, 31, 84, 62, 191, 71, 98, 62, 142, 198, 112, 62, 176, 151, 127, 62, 82, 91, 135, 62, 96, 15, 143, 62, 152, 229, 150, 62, 121, 219, 158, 62, 112, 238, 166, 62, 216, 27, 175, 62, 251, 96, 183, 62, 17, 187, 191, 62, 70, 39, 200, 62, 183, 162, 208, 62, 120, 42, 217, 62, 148, 187, 225, 62, 12, 83, 234, 62, 222, 237, 242, 62, 6, 137, 251, 62, 190, 16, 2, 63, 31, 90, 6, 63, 36, 159, 10, 63, 80, 222, 14, 63, 43, 22, 19, 63, 65, 69, 23, 63, 37, 106, 27, 63, 115, 131, 31, 63, 206, 143, 35, 63, 230, 141, 39, 63, 116, 124, 43, 63, 63, 90, 47, 63, 25, 38, 51, 63, 231, 222, 54, 63, 153, 131, 58, 63, 51, 19, 62, 63, 197, 140, 65, 63, 119, 239, 68, 63, 127, 58, 72, 63, 39, 109, 75, 63, 206, 134, 78, 63, 229, 134, 81, 63, 241, 108, 84, 63, 142, 56, 87, 63, 105, 233, 89, 63, 69, 127, 92, 63, 250, 249, 94, 63, 115, 89, 97, 63, 175, 157, 99, 63, 193, 198, 101, 63, 207, 212, 103, 63, 17, 200, 105, 63, 210, 160, 107, 63, 110, 95, 109, 63, 80, 4, 111, 63, 244, 143, 112, 63, 230, 2, 114, 63, 189, 93, 115, 63, 31, 161, 116, 63, 191, 205, 117, 63, 87, 228, 118, 63, 176, 229, 119, 63, 151, 210, 120, 63, 227, 171, 121, 63, 115, 114, 122, 63, 39, 39, 123, 63, 231, 202, 123, 63, 157, 94, 124, 63, 53, 227, 124, 63, 156, 89, 125, 63, 189, 194, 125, 63, 134, 31, 126, 63, 222, 112, 126, 63, 171, 183, 126, 63, 207, 244, 126, 63, 38, 41, 127, 63, 134, 85, 127, 63, 190, 122, 127, 63, 150, 153, 127, 63, 204, 178, 127, 63, 20, 199, 127, 63, 28, 215, 127, 63, 130, 227, 127, 63, 221, 236, 127, 63, 182, 243, 127, 63, 138, 248, 127, 63, 200, 251, 127, 63, 214, 253, 127, 63, 7, 255, 127, 63, 165, 255, 127, 63, 232, 255, 127, 63, 253, 255, 127, 63, 0, 0, 128, 63, 224, 1, 0, 0, 135, 136, 8, 59, 255, 255, 255, 255, 5, 0, 96, 0, 3, 0, 32, 0, 4, 0, 8, 0, 2, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 81, 0, 0, 160, 57, 0, 0, 240, 0, 0, 0, 137, 136, 136, 59, 1, 0, 0, 0, 5, 0, 48, 0, 3, 0, 16, 0, 4, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 96, 79, 0, 0, 160, 57, 0, 0, 120, 0, 0, 0, 136, 136, 8, 60, 2, 0, 0, 0, 5, 0, 24, 0, 3, 0, 8, 0, 2, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 112, 78, 0, 0, 160, 57, 0, 0, 60, 0, 0, 0, 137, 136, 136, 60, 3, 0, 0, 0, 5, 0, 12, 0, 3, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 248, 77, 0, 0, 160, 57, 0, 0, 255, 255, 127, 63, 142, 255, 127, 63, 106, 254, 127, 63, 147, 252, 127, 63, 7, 250, 127, 63, 200, 246, 127, 63, 214, 242, 127, 63, 48, 238, 127, 63, 214, 232, 127, 63, 200, 226, 127, 63, 7, 220, 127, 63, 147, 212, 127, 63, 107, 204, 127, 63, 143, 195, 127, 63, 0, 186, 127, 63, 189, 175, 127, 63, 199, 164, 127, 63, 29, 153, 127, 63, 192, 140, 127, 63, 176, 127, 127, 63, 236, 113, 127, 63, 118, 99, 127, 63, 75, 84, 127, 63, 110, 68, 127, 63, 222, 51, 127, 63, 154, 34, 127, 63, 163, 16, 127, 63, 250, 253, 126, 63, 157, 234, 126, 63, 141, 214, 126, 63, 203, 193, 126, 63, 86, 172, 126, 63, 46, 150, 126, 63, 83, 127, 126, 63, 198, 103, 126, 63, 134, 79, 126, 63, 148, 54, 126, 63, 239, 28, 126, 63, 152, 2, 126, 63, 143, 231, 125, 63, 211, 203, 125, 63, 102, 175, 125, 63, 70, 146, 125, 63, 116, 116, 125, 63, 241, 85, 125, 63, 188, 54, 125, 63, 213, 22, 125, 63, 60, 246, 124, 63, 242, 212, 124, 63, 246, 178, 124, 63, 73, 144, 124, 63, 235, 108, 124, 63, 219, 72, 124, 63, 27, 36, 124, 63, 169, 254, 123, 63, 135, 216, 123, 63, 180, 177, 123, 63, 48, 138, 123, 63, 252, 97, 123, 63, 23, 57, 123, 63, 130, 15, 123, 63, 61, 229, 122, 63, 72, 186, 122, 63, 162, 142, 122, 63, 77, 98, 122, 63, 72, 53, 122, 63, 148, 7, 122, 63, 48, 217, 121, 63, 29, 170, 121, 63, 90, 122, 121, 63, 233, 73, 121, 63, 200, 24, 121, 63, 249, 230, 120, 63, 123, 180, 120, 63, 78, 129, 120, 63, 115, 77, 120, 63, 234, 24, 120, 63, 178, 227, 119, 63, 205, 173, 119, 63, 58, 119, 119, 63, 249, 63, 119, 63, 10, 8, 119, 63, 110, 207, 118, 63, 37, 150, 118, 63, 47, 92, 118, 63, 140, 33, 118, 63, 60, 230, 117, 63, 64, 170, 117, 63, 151, 109, 117, 63, 66, 48, 117, 63, 65, 242, 116, 63, 148, 179, 116, 63, 59, 116, 116, 63, 55, 52, 116, 63, 135, 243, 115, 63, 44, 178, 115, 63, 38, 112, 115, 63, 118, 45, 115, 63, 26, 234, 114, 63, 20, 166, 114, 63, 100, 97, 114, 63, 10, 28, 114, 63, 5, 214, 113, 63, 87, 143, 113, 63, 0, 72, 113, 63, 255, 255, 112, 63, 85, 183, 112, 63, 2, 110, 112, 63, 6, 36, 112, 63, 98, 217, 111, 63, 21, 142, 111, 63, 32, 66, 111, 63, 132, 245, 110, 63, 63, 168, 110, 63, 83, 90, 110, 63, 192, 11, 110, 63, 134, 188, 109, 63, 165, 108, 109, 63, 29, 28, 109, 63, 239, 202, 108, 63, 27, 121, 108, 63, 161, 38, 108, 63, 128, 211, 107, 63, 187, 127, 107, 63, 80, 43, 107, 63, 64, 214, 106, 63, 140, 128, 106, 63, 50, 42, 106, 63, 53, 211, 105, 63, 147, 123, 105, 63, 77, 35, 105, 63, 100, 202, 104, 63, 216, 112, 104, 63, 168, 22, 104, 63, 213, 187, 103, 63, 96, 96, 103, 63, 72, 4, 103, 63, 143, 167, 102, 63, 51, 74, 102, 63, 54, 236, 101, 63, 151, 141, 101, 63, 87, 46, 101, 63, 119, 206, 100, 63, 245, 109, 100, 63, 212, 12, 100, 63, 18, 171, 99, 63, 177, 72, 99, 63, 176, 229, 98, 63, 16, 130, 98, 63, 209, 29, 98, 63, 243, 184, 97, 63, 119, 83, 97, 63, 92, 237, 96, 63, 164, 134, 96, 63, 78, 31, 96, 63, 91, 183, 95, 63, 203, 78, 95, 63, 158, 229, 94, 63, 213, 123, 94, 63, 112, 17, 94, 63, 110, 166, 93, 63, 210, 58, 93, 63, 154, 206, 92, 63, 198, 97, 92, 63, 89, 244, 91, 63, 81, 134, 91, 63, 174, 23, 91, 63, 114, 168, 90, 63, 157, 56, 90, 63, 46, 200, 89, 63, 39, 87, 89, 63, 135, 229, 88, 63, 79, 115, 88, 63, 127, 0, 88, 63, 23, 141, 87, 63, 24, 25, 87, 63, 130, 164, 86, 63, 86, 47, 86, 63, 147, 185, 85, 63, 58, 67, 85, 63, 75, 204, 84, 63, 199, 84, 84, 63, 174, 220, 83, 63, 1, 100, 83, 63, 191, 234, 82, 63, 233, 112, 82, 63, 127, 246, 81, 63, 130, 123, 81, 63, 242, 255, 80, 63, 207, 131, 80, 63, 26, 7, 80, 63, 210, 137, 79, 63, 250, 11, 79, 63, 144, 141, 78, 63, 148, 14, 78, 63, 9, 143, 77, 63, 237, 14, 77, 63, 65, 142, 76, 63, 5, 13, 76, 63, 59, 139, 75, 63, 225, 8, 75, 63, 249, 133, 74, 63, 131, 2, 74, 63, 127, 126, 73, 63, 238, 249, 72, 63, 207, 116, 72, 63, 36, 239, 71, 63, 237, 104, 71, 63, 41, 226, 70, 63, 218, 90, 70, 63, 0, 211, 69, 63, 155, 74, 69, 63, 172, 193, 68, 63, 50, 56, 68, 63, 47, 174, 67, 63, 162, 35, 67, 63, 141, 152, 66, 63, 239, 12, 66, 63, 200, 128, 65, 63, 26, 244, 64, 63, 229, 102, 64, 63, 40, 217, 63, 63, 229, 74, 63, 63, 27, 188, 62, 63, 204, 44, 62, 63, 247, 156, 61, 63, 157, 12, 61, 63, 190, 123, 60, 63, 92, 234, 59, 63, 117, 88, 59, 63, 10, 198, 58, 63, 29, 51, 58, 63, 173, 159, 57, 63, 187, 11, 57, 63, 71, 119, 56, 63, 81, 226, 55, 63, 218, 76, 55, 63, 227, 182, 54, 63, 107, 32, 54, 63, 116, 137, 53, 63, 253, 241, 52, 63, 7, 90, 52, 63, 147, 193, 51, 63, 160, 40, 51, 63, 48, 143, 50, 63, 66, 245, 49, 63, 216, 90, 49, 63, 241, 191, 48, 63, 142, 36, 48, 63, 175, 136, 47, 63, 85, 236, 46, 63, 129, 79, 46, 63, 50, 178, 45, 63, 105, 20, 45, 63, 39, 118, 44, 63, 107, 215, 43, 63, 55, 56, 43, 63, 139, 152, 42, 63, 103, 248, 41, 63, 204, 87, 41, 63, 186, 182, 40, 63, 50, 21, 40, 63, 51, 115, 39, 63, 191, 208, 38, 63, 214, 45, 38, 63, 121, 138, 37, 63, 167, 230, 36, 63, 97, 66, 36, 63, 169, 157, 35, 63, 125, 248, 34, 63, 223, 82, 34, 63, 207, 172, 33, 63, 77, 6, 33, 63, 91, 95, 32, 63, 248, 183, 31, 63, 37, 16, 31, 63, 226, 103, 30, 63, 48, 191, 29, 63, 16, 22, 29, 63, 129, 108, 28, 63, 132, 194, 27, 63, 26, 24, 27, 63, 67, 109, 26, 63, 0, 194, 25, 63, 81, 22, 25, 63, 54, 106, 24, 63, 177, 189, 23, 63, 193, 16, 23, 63, 103, 99, 22, 63, 163, 181, 21, 63, 118, 7, 21, 63, 225, 88, 20, 63, 228, 169, 19, 63, 127, 250, 18, 63, 179, 74, 18, 63, 128, 154, 17, 63, 231, 233, 16, 63, 232, 56, 16, 63, 132, 135, 15, 63, 187, 213, 14, 63, 142, 35, 14, 63, 254, 112, 13, 63, 10, 190, 12, 63, 179, 10, 12, 63, 250, 86, 11, 63, 223, 162, 10, 63, 99, 238, 9, 63, 134, 57, 9, 63, 73, 132, 8, 63, 172, 206, 7, 63, 175, 24, 7, 63, 84, 98, 6, 63, 155, 171, 5, 63, 131, 244, 4, 63, 15, 61, 4, 63, 61, 133, 3, 63, 15, 205, 2, 63, 134, 20, 2, 63, 161, 91, 1, 63, 97, 162, 0, 63, 143, 209, 255, 62, 167, 93, 254, 62, 14, 233, 252, 62, 194, 115, 251, 62, 198, 253, 249, 62, 27, 135, 248, 62, 193, 15, 247, 62, 186, 151, 245, 62, 6, 31, 244, 62, 168, 165, 242, 62, 158, 43, 241, 62, 236, 176, 239, 62, 145, 53, 238, 62, 144, 185, 236, 62, 232, 60, 235, 62, 154, 191, 233, 62, 169, 65, 232, 62, 21, 195, 230, 62, 223, 67, 229, 62, 8, 196, 227, 62, 145, 67, 226, 62, 124, 194, 224, 62, 200, 64, 223, 62, 120, 190, 221, 62, 140, 59, 220, 62, 6, 184, 218, 62, 230, 51, 217, 62, 46, 175, 215, 62, 223, 41, 214, 62, 249, 163, 212, 62, 125, 29, 211, 62, 110, 150, 209, 62, 204, 14, 208, 62, 151, 134, 206, 62, 210, 253, 204, 62, 125, 116, 203, 62, 153, 234, 201, 62, 39, 96, 200, 62, 40, 213, 198, 62, 159, 73, 197, 62, 138, 189, 195, 62, 236, 48, 194, 62, 198, 163, 192, 62, 25, 22, 191, 62, 230, 135, 189, 62, 45, 249, 187, 62, 241, 105, 186, 62, 50, 218, 184, 62, 241, 73, 183, 62, 47, 185, 181, 62, 238, 39, 180, 62, 47, 150, 178, 62, 242, 3, 177, 62, 57, 113, 175, 62, 4, 222, 173, 62, 86, 74, 172, 62, 47, 182, 170, 62, 144, 33, 169, 62, 122, 140, 167, 62, 239, 246, 165, 62, 239, 96, 164, 62, 124, 202, 162, 62, 151, 51, 161, 62, 64, 156, 159, 62, 122, 4, 158, 62, 68, 108, 156, 62, 161, 211, 154, 62, 145, 58, 153, 62, 22, 161, 151, 62, 48, 7, 150, 62, 225, 108, 148, 62, 41, 210, 146, 62, 11, 55, 145, 62, 135, 155, 143, 62, 158, 255, 141, 62, 81, 99, 140, 62, 162, 198, 138, 62, 145, 41, 137, 62, 32, 140, 135, 62, 80, 238, 133, 62, 34, 80, 132, 62, 151, 177, 130, 62, 176, 18, 129, 62, 222, 230, 126, 62, 169, 167, 123, 62, 195, 103, 120, 62, 47, 39, 117, 62, 238, 229, 113, 62, 4, 164, 110, 62, 115, 97, 107, 62, 60, 30, 104, 62, 98, 218, 100, 62, 232, 149, 97, 62, 207, 80, 94, 62, 26, 11, 91, 62, 204, 196, 87, 62, 230, 125, 84, 62, 107, 54, 81, 62, 93, 238, 77, 62, 191, 165, 74, 62, 146, 92, 71, 62, 218, 18, 68, 62, 151, 200, 64, 62, 206, 125, 61, 62, 128, 50, 58, 62, 174, 230, 54, 62, 93, 154, 51, 62, 141, 77, 48, 62, 66, 0, 45, 62, 125, 178, 41, 62, 66, 100, 38, 62, 145, 21, 35, 62, 110, 198, 31, 62, 219, 118, 28, 62, 218, 38, 25, 62, 109, 214, 21, 62, 152, 133, 18, 62, 91, 52, 15, 62, 186, 226, 11, 62, 183, 144, 8, 62, 84, 62, 5, 62, 148, 235, 1, 62, 240, 48, 253, 61, 6, 138, 246, 61, 113, 226, 239, 61, 51, 58, 233, 61, 79, 145, 226, 61, 207, 231, 219, 61, 181, 61, 213, 61, 3, 147, 206, 61, 192, 231, 199, 61, 242, 59, 193, 61, 156, 143, 186, 61, 195, 226, 179, 61, 108, 53, 173, 61, 155, 135, 166, 61, 85, 217, 159, 61, 159, 42, 153, 61, 126, 123, 146, 61, 246, 203, 139, 61, 11, 28, 133, 61, 135, 215, 124, 61, 70, 118, 111, 61, 93, 20, 98, 61, 214, 177, 84, 61, 185, 78, 71, 61, 16, 235, 57, 61, 229, 134, 44, 61, 64, 34, 31, 61, 44, 189, 17, 61, 178, 87, 4, 61, 181, 227, 237, 60, 96, 23, 211, 60, 118, 74, 184, 60, 11, 125, 157, 60, 50, 175, 130, 60, 250, 193, 79, 60, 254, 36, 26, 60, 42, 15, 201, 59, 153, 167, 59, 59, 46, 125, 214, 185, 210, 70, 113, 187, 171, 222, 227, 187, 166, 140, 39, 188, 129, 41, 93, 188, 225, 98, 137, 188, 160, 48, 164, 188, 236, 253, 190, 188, 179, 202, 217, 188, 224, 150, 244, 188, 49, 177, 7, 189, 147, 22, 21, 189, 140, 123, 34, 189, 19, 224, 47, 189, 30, 68, 61, 189, 165, 167, 74, 189, 157, 10, 88, 189, 254, 108, 101, 189, 190, 206, 114, 189, 234, 23, 128, 189, 27, 200, 134, 189, 237, 119, 141, 189, 92, 39, 148, 189, 99, 214, 154, 189, 253, 132, 161, 189, 38, 51, 168, 189, 217, 224, 174, 189, 17, 142, 181, 189, 202, 58, 188, 189, 254, 230, 194, 189, 170, 146, 201, 189, 200, 61, 208, 189, 84, 232, 214, 189, 74, 146, 221, 189, 164, 59, 228, 189, 93, 228, 234, 189, 114, 140, 241, 189, 221, 51, 248, 189, 154, 218, 254, 189, 82, 192, 2, 190, 252, 18, 6, 190, 71, 101, 9, 190, 50, 183, 12, 190, 186, 8, 16, 190, 221, 89, 19, 190, 152, 170, 22, 190, 234, 250, 25, 190, 208, 74, 29, 190, 71, 154, 32, 190, 78, 233, 35, 190, 225, 55, 39, 190, 0, 134, 42, 190, 166, 211, 45, 190, 211, 32, 49, 190, 131, 109, 52, 190, 181, 185, 55, 190, 101, 5, 59, 190, 147, 80, 62, 190, 58, 155, 65, 190, 90, 229, 68, 190, 240, 46, 72, 190, 249, 119, 75, 190, 116, 192, 78, 190, 93, 8, 82, 190, 179, 79, 85, 190, 115, 150, 88, 190, 156, 220, 91, 190, 42, 34, 95, 190, 27, 103, 98, 190, 109, 171, 101, 190, 31, 239, 104, 190, 44, 50, 108, 190, 148, 116, 111, 190, 84, 182, 114, 190, 106, 247, 117, 190, 211, 55, 121, 190, 141, 119, 124, 190, 150, 182, 127, 190, 117, 122, 129, 190, 69, 25, 131, 190, 185, 183, 132, 190, 208, 85, 134, 190, 136, 243, 135, 190, 225, 144, 137, 190, 218, 45, 139, 190, 112, 202, 140, 190, 164, 102, 142, 190, 116, 2, 144, 190, 223, 157, 145, 190, 228, 56, 147, 190, 129, 211, 148, 190, 182, 109, 150, 190, 129, 7, 152, 190, 226, 160, 153, 190, 215, 57, 155, 190, 95, 210, 156, 190, 121, 106, 158, 190, 35, 2, 160, 190, 94, 153, 161, 190, 38, 48, 163, 190, 125, 198, 164, 190, 96, 92, 166, 190, 206, 241, 167, 190, 198, 134, 169, 190, 71, 27, 171, 190, 80, 175, 172, 190, 224, 66, 174, 190, 245, 213, 175, 190, 143, 104, 177, 190, 173, 250, 178, 190, 77, 140, 180, 190, 110, 29, 182, 190, 16, 174, 183, 190, 48, 62, 185, 190, 207, 205, 186, 190, 234, 92, 188, 190, 130, 235, 189, 190, 148, 121, 191, 190, 31, 7, 193, 190, 35, 148, 194, 190, 159, 32, 196, 190, 145, 172, 197, 190, 248, 55, 199, 190, 211, 194, 200, 190, 34, 77, 202, 190, 226, 214, 203, 190, 19, 96, 205, 190, 181, 232, 206, 190, 197, 112, 208, 190, 66, 248, 209, 190, 45, 127, 211, 190, 131, 5, 213, 190, 67, 139, 214, 190, 109, 16, 216, 190, 255, 148, 217, 190, 249, 24, 219, 190, 89, 156, 220, 190, 29, 31, 222, 190, 70, 161, 223, 190, 211, 34, 225, 190, 193, 163, 226, 190, 16, 36, 228, 190, 190, 163, 229, 190, 204, 34, 231, 190, 56, 161, 232, 190, 0, 31, 234, 190, 36, 156, 235, 190, 162, 24, 237, 190, 122, 148, 238, 190, 171, 15, 240, 190, 51, 138, 241, 190, 18, 4, 243, 190, 70, 125, 244, 190, 207, 245, 245, 190, 170, 109, 247, 190, 217, 228, 248, 190, 88, 91, 250, 190, 40, 209, 251, 190, 71, 70, 253, 190, 181, 186, 254, 190, 56, 23, 0, 191, 187, 208, 0, 191, 228, 137, 1, 191, 178, 66, 2, 191, 37, 251, 2, 191, 59, 179, 3, 191, 246, 106, 4, 191, 83, 34, 5, 191, 83, 217, 5, 191, 245, 143, 6, 191, 56, 70, 7, 191, 29, 252, 7, 191, 162, 177, 8, 191, 199, 102, 9, 191, 140, 27, 10, 191, 240, 207, 10, 191, 243, 131, 11, 191, 147, 55, 12, 191, 209, 234, 12, 191, 172, 157, 13, 191, 36, 80, 14, 191, 56, 2, 15, 191, 232, 179, 15, 191, 50, 101, 16, 191, 24, 22, 17, 191, 151, 198, 17, 191, 176, 118, 18, 191, 99, 38, 19, 191, 174, 213, 19, 191, 145, 132, 20, 191, 13, 51, 21, 191, 31, 225, 21, 191, 200, 142, 22, 191, 8, 60, 23, 191], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
allocate([221, 232, 23, 191, 72, 149, 24, 191, 72, 65, 25, 191, 220, 236, 25, 191, 4, 152, 26, 191, 192, 66, 27, 191, 15, 237, 27, 191, 240, 150, 28, 191, 99, 64, 29, 191, 104, 233, 29, 191, 254, 145, 30, 191, 37, 58, 31, 191, 220, 225, 31, 191, 35, 137, 32, 191, 250, 47, 33, 191, 95, 214, 33, 191, 82, 124, 34, 191, 212, 33, 35, 191, 227, 198, 35, 191, 127, 107, 36, 191, 167, 15, 37, 191, 92, 179, 37, 191, 157, 86, 38, 191, 104, 249, 38, 191, 191, 155, 39, 191, 160, 61, 40, 191, 11, 223, 40, 191, 255, 127, 41, 191, 125, 32, 42, 191, 131, 192, 42, 191, 17, 96, 43, 191, 39, 255, 43, 191, 196, 157, 44, 191, 232, 59, 45, 191, 146, 217, 45, 191, 195, 118, 46, 191, 121, 19, 47, 191, 180, 175, 47, 191, 115, 75, 48, 191, 183, 230, 48, 191, 127, 129, 49, 191, 203, 27, 50, 191, 153, 181, 50, 191, 234, 78, 51, 191, 189, 231, 51, 191, 18, 128, 52, 191, 232, 23, 53, 191, 63, 175, 53, 191, 22, 70, 54, 191, 110, 220, 54, 191, 69, 114, 55, 191, 156, 7, 56, 191, 113, 156, 56, 191, 197, 48, 57, 191, 150, 196, 57, 191, 230, 87, 58, 191, 178, 234, 58, 191, 252, 124, 59, 191, 194, 14, 60, 191, 3, 160, 60, 191, 193, 48, 61, 191, 250, 192, 61, 191, 173, 80, 62, 191, 219, 223, 62, 191, 131, 110, 63, 191, 165, 252, 63, 191, 64, 138, 64, 191, 83, 23, 65, 191, 224, 163, 65, 191, 228, 47, 66, 191, 96, 187, 66, 191, 83, 70, 67, 191, 190, 208, 67, 191, 158, 90, 68, 191, 246, 227, 68, 191, 194, 108, 69, 191, 5, 245, 69, 191, 188, 124, 70, 191, 232, 3, 71, 191, 137, 138, 71, 191, 157, 16, 72, 191, 37, 150, 72, 191, 32, 27, 73, 191, 142, 159, 73, 191, 111, 35, 74, 191, 193, 166, 74, 191, 134, 41, 75, 191, 188, 171, 75, 191, 99, 45, 76, 191, 122, 174, 76, 191, 2, 47, 77, 191, 250, 174, 77, 191, 98, 46, 78, 191, 57, 173, 78, 191, 126, 43, 79, 191, 51, 169, 79, 191, 85, 38, 80, 191, 230, 162, 80, 191, 228, 30, 81, 191, 80, 154, 81, 191, 40, 21, 82, 191, 109, 143, 82, 191, 30, 9, 83, 191, 59, 130, 83, 191, 195, 250, 83, 191, 183, 114, 84, 191, 22, 234, 84, 191, 223, 96, 85, 191, 18, 215, 85, 191, 176, 76, 86, 191, 183, 193, 86, 191, 39, 54, 87, 191, 0, 170, 87, 191, 66, 29, 88, 191, 236, 143, 88, 191, 254, 1, 89, 191, 120, 115, 89, 191, 89, 228, 89, 191, 162, 84, 90, 191, 81, 196, 90, 191, 102, 51, 91, 191, 226, 161, 91, 191, 195, 15, 92, 191, 10, 125, 92, 191, 183, 233, 92, 191, 200, 85, 93, 191, 62, 193, 93, 191, 24, 44, 94, 191, 87, 150, 94, 191, 249, 255, 94, 191, 255, 104, 95, 191, 104, 209, 95, 191, 51, 57, 96, 191, 98, 160, 96, 191, 243, 6, 97, 191, 229, 108, 97, 191, 58, 210, 97, 191, 240, 54, 98, 191, 8, 155, 98, 191, 128, 254, 98, 191, 89, 97, 99, 191, 146, 195, 99, 191, 44, 37, 100, 191, 37, 134, 100, 191, 126, 230, 100, 191, 55, 70, 101, 191, 78, 165, 101, 191, 197, 3, 102, 191, 154, 97, 102, 191, 205, 190, 102, 191, 94, 27, 103, 191, 77, 119, 103, 191, 154, 210, 103, 191, 68, 45, 104, 191, 75, 135, 104, 191, 174, 224, 104, 191, 111, 57, 105, 191, 139, 145, 105, 191, 4, 233, 105, 191, 217, 63, 106, 191, 9, 150, 106, 191, 148, 235, 106, 191, 123, 64, 107, 191, 188, 148, 107, 191, 89, 232, 107, 191, 79, 59, 108, 191, 160, 141, 108, 191, 75, 223, 108, 191, 79, 48, 109, 191, 173, 128, 109, 191, 101, 208, 109, 191, 117, 31, 110, 191, 223, 109, 110, 191, 161, 187, 110, 191, 187, 8, 111, 191, 46, 85, 111, 191, 248, 160, 111, 191, 27, 236, 111, 191, 149, 54, 112, 191, 103, 128, 112, 191, 144, 201, 112, 191, 15, 18, 113, 191, 230, 89, 113, 191, 19, 161, 113, 191, 151, 231, 113, 191, 113, 45, 114, 191, 160, 114, 114, 191, 38, 183, 114, 191, 1, 251, 114, 191, 50, 62, 115, 191, 184, 128, 115, 191, 148, 194, 115, 191, 196, 3, 116, 191, 73, 68, 116, 191, 34, 132, 116, 191, 80, 195, 116, 191, 210, 1, 117, 191, 168, 63, 117, 191, 210, 124, 117, 191, 80, 185, 117, 191, 33, 245, 117, 191, 69, 48, 118, 191, 189, 106, 118, 191, 136, 164, 118, 191, 166, 221, 118, 191, 22, 22, 119, 191, 217, 77, 119, 191, 239, 132, 119, 191, 87, 187, 119, 191, 17, 241, 119, 191, 29, 38, 120, 191, 122, 90, 120, 191, 42, 142, 120, 191, 43, 193, 120, 191, 125, 243, 120, 191, 33, 37, 121, 191, 22, 86, 121, 191, 92, 134, 121, 191, 242, 181, 121, 191, 218, 228, 121, 191, 18, 19, 122, 191, 154, 64, 122, 191, 115, 109, 122, 191, 157, 153, 122, 191, 22, 197, 122, 191, 223, 239, 122, 191, 248, 25, 123, 191, 97, 67, 123, 191, 26, 108, 123, 191, 34, 148, 123, 191, 122, 187, 123, 191, 32, 226, 123, 191, 23, 8, 124, 191, 92, 45, 124, 191, 240, 81, 124, 191, 211, 117, 124, 191, 5, 153, 124, 191, 134, 187, 124, 191, 85, 221, 124, 191, 115, 254, 124, 191, 223, 30, 125, 191, 154, 62, 125, 191, 163, 93, 125, 191, 250, 123, 125, 191, 159, 153, 125, 191, 146, 182, 125, 191, 211, 210, 125, 191, 98, 238, 125, 191, 63, 9, 126, 191, 105, 35, 126, 191, 225, 60, 126, 191, 167, 85, 126, 191, 186, 109, 126, 191, 27, 133, 126, 191, 201, 155, 126, 191, 196, 177, 126, 191, 13, 199, 126, 191, 162, 219, 126, 191, 133, 239, 126, 191, 181, 2, 127, 191, 50, 21, 127, 191, 252, 38, 127, 191, 19, 56, 127, 191, 118, 72, 127, 191, 39, 88, 127, 191, 36, 103, 127, 191, 110, 117, 127, 191, 5, 131, 127, 191, 232, 143, 127, 191, 25, 156, 127, 191, 149, 167, 127, 191, 95, 178, 127, 191, 116, 188, 127, 191, 215, 197, 127, 191, 133, 206, 127, 191, 129, 214, 127, 191, 200, 221, 127, 191, 93, 228, 127, 191, 61, 234, 127, 191, 106, 239, 127, 191, 227, 243, 127, 191, 169, 247, 127, 191, 187, 250, 127, 191, 25, 253, 127, 191, 196, 254, 127, 191, 187, 255, 127, 191, 250, 255, 127, 63, 57, 254, 127, 63, 169, 249, 127, 63, 75, 242, 127, 63, 30, 232, 127, 63, 35, 219, 127, 63, 89, 203, 127, 63, 193, 184, 127, 63, 91, 163, 127, 63, 40, 139, 127, 63, 39, 112, 127, 63, 90, 82, 127, 63, 191, 49, 127, 63, 88, 14, 127, 63, 37, 232, 126, 63, 38, 191, 126, 63, 92, 147, 126, 63, 200, 100, 126, 63, 105, 51, 126, 63, 65, 255, 125, 63, 79, 200, 125, 63, 150, 142, 125, 63, 20, 82, 125, 63, 203, 18, 125, 63, 188, 208, 124, 63, 231, 139, 124, 63, 77, 68, 124, 63, 239, 249, 123, 63, 205, 172, 123, 63, 233, 92, 123, 63, 67, 10, 123, 63, 221, 180, 122, 63, 182, 92, 122, 63, 209, 1, 122, 63, 46, 164, 121, 63, 206, 67, 121, 63, 178, 224, 120, 63, 220, 122, 120, 63, 76, 18, 120, 63, 4, 167, 119, 63, 4, 57, 119, 63, 79, 200, 118, 63, 228, 84, 118, 63, 198, 222, 117, 63, 246, 101, 117, 63, 117, 234, 116, 63, 68, 108, 116, 63, 101, 235, 115, 63, 218, 103, 115, 63, 163, 225, 114, 63, 194, 88, 114, 63, 57, 205, 113, 63, 9, 63, 113, 63, 52, 174, 112, 63, 187, 26, 112, 63, 160, 132, 111, 63, 228, 235, 110, 63, 138, 80, 110, 63, 147, 178, 109, 63, 1, 18, 109, 63, 213, 110, 108, 63, 17, 201, 107, 63, 183, 32, 107, 63, 201, 117, 106, 63, 73, 200, 105, 63, 57, 24, 105, 63, 155, 101, 104, 63, 111, 176, 103, 63, 186, 248, 102, 63, 124, 62, 102, 63, 184, 129, 101, 63, 111, 194, 100, 63, 164, 0, 100, 63, 90, 60, 99, 63, 145, 117, 98, 63, 76, 172, 97, 63, 142, 224, 96, 63, 89, 18, 96, 63, 174, 65, 95, 63, 145, 110, 94, 63, 3, 153, 93, 63, 8, 193, 92, 63, 160, 230, 91, 63, 207, 9, 91, 63, 152, 42, 90, 63, 251, 72, 89, 63, 253, 100, 88, 63, 159, 126, 87, 63, 229, 149, 86, 63, 208, 170, 85, 63, 99, 189, 84, 63, 161, 205, 83, 63, 140, 219, 82, 63, 39, 231, 81, 63, 117, 240, 80, 63, 121, 247, 79, 63, 52, 252, 78, 63, 171, 254, 77, 63, 223, 254, 76, 63, 212, 252, 75, 63, 140, 248, 74, 63, 10, 242, 73, 63, 82, 233, 72, 63, 101, 222, 71, 63, 71, 209, 70, 63, 251, 193, 69, 63, 132, 176, 68, 63, 229, 156, 67, 63, 32, 135, 66, 63, 58, 111, 65, 63, 52, 85, 64, 63, 19, 57, 63, 63, 216, 26, 62, 63, 136, 250, 60, 63, 38, 216, 59, 63, 180, 179, 58, 63, 54, 141, 57, 63, 175, 100, 56, 63, 34, 58, 55, 63, 147, 13, 54, 63, 5, 223, 52, 63, 124, 174, 51, 63, 249, 123, 50, 63, 130, 71, 49, 63, 25, 17, 48, 63, 194, 216, 46, 63, 127, 158, 45, 63, 86, 98, 44, 63, 72, 36, 43, 63, 90, 228, 41, 63, 144, 162, 40, 63, 235, 94, 39, 63, 113, 25, 38, 63, 37, 210, 36, 63, 9, 137, 35, 63, 35, 62, 34, 63, 117, 241, 32, 63, 4, 163, 31, 63, 210, 82, 30, 63, 228, 0, 29, 63, 61, 173, 27, 63, 225, 87, 26, 63, 211, 0, 25, 63, 25, 168, 23, 63, 180, 77, 22, 63, 170, 241, 20, 63, 253, 147, 19, 63, 178, 52, 18, 63, 204, 211, 16, 63, 80, 113, 15, 63, 66, 13, 14, 63, 164, 167, 12, 63, 124, 64, 11, 63, 205, 215, 9, 63, 154, 109, 8, 63, 233, 1, 7, 63, 189, 148, 5, 63, 25, 38, 4, 63, 3, 182, 2, 63, 126, 68, 1, 63, 28, 163, 255, 62, 110, 186, 252, 62, 250, 206, 249, 62, 202, 224, 246, 62, 228, 239, 243, 62, 81, 252, 240, 62, 26, 6, 238, 62, 71, 13, 235, 62, 224, 17, 232, 62, 237, 19, 229, 62, 119, 19, 226, 62, 135, 16, 223, 62, 36, 11, 220, 62, 88, 3, 217, 62, 42, 249, 213, 62, 164, 236, 210, 62, 205, 221, 207, 62, 175, 204, 204, 62, 82, 185, 201, 62, 191, 163, 198, 62, 254, 139, 195, 62, 24, 114, 192, 62, 22, 86, 189, 62, 0, 56, 186, 62, 224, 23, 183, 62, 189, 245, 179, 62, 161, 209, 176, 62, 149, 171, 173, 62, 162, 131, 170, 62, 207, 89, 167, 62, 39, 46, 164, 62, 178, 0, 161, 62, 121, 209, 157, 62, 133, 160, 154, 62, 223, 109, 151, 62, 143, 57, 148, 62, 160, 3, 145, 62, 26, 204, 141, 62, 5, 147, 138, 62, 107, 88, 135, 62, 86, 28, 132, 62, 205, 222, 128, 62, 182, 63, 123, 62, 16, 191, 116, 62, 187, 59, 110, 62, 201, 181, 103, 62, 77, 45, 97, 62, 89, 162, 90, 62, 255, 20, 84, 62, 81, 133, 77, 62, 99, 243, 70, 62, 70, 95, 64, 62, 13, 201, 57, 62, 202, 48, 51, 62, 144, 150, 44, 62, 114, 250, 37, 62, 130, 92, 31, 62, 210, 188, 24, 62, 118, 27, 18, 62, 127, 120, 11, 62, 1, 212, 4, 62, 29, 92, 252, 61, 114, 13, 239, 61, 41, 188, 225, 61, 102, 104, 212, 61, 78, 18, 199, 61, 8, 186, 185, 61, 184, 95, 172, 61, 132, 3, 159, 61, 146, 165, 145, 61, 7, 70, 132, 61, 18, 202, 109, 61, 122, 5, 83, 61, 145, 62, 56, 61, 164, 117, 29, 61, 252, 170, 2, 61, 202, 189, 207, 60, 86, 35, 154, 60, 97, 14, 73, 60, 197, 167, 187, 59, 61, 122, 86, 186, 9, 70, 241, 187, 18, 221, 99, 188, 80, 138, 167, 188, 65, 36, 221, 188, 227, 93, 9, 189, 35, 40, 36, 189, 150, 240, 62, 189, 242, 182, 89, 189, 234, 122, 116, 189, 26, 158, 135, 189, 66, 253, 148, 189, 200, 90, 162, 189, 134, 182, 175, 189, 87, 16, 189, 189, 22, 104, 202, 189, 155, 189, 215, 189, 195, 16, 229, 189, 105, 97, 242, 189, 101, 175, 255, 189, 74, 125, 6, 190, 104, 33, 13, 190, 250, 195, 19, 190, 237, 100, 26, 190, 46, 4, 33, 190, 172, 161, 39, 190, 83, 61, 46, 190, 16, 215, 52, 190, 210, 110, 59, 190, 134, 4, 66, 190, 25, 152, 72, 190, 121, 41, 79, 190, 148, 184, 85, 190, 86, 69, 92, 190, 174, 207, 98, 190, 137, 87, 105, 190, 214, 220, 111, 190, 128, 95, 118, 190, 120, 223, 124, 190, 84, 174, 129, 190, 129, 235, 132, 190, 56, 39, 136, 190, 114, 97, 139, 190, 36, 154, 142, 190, 69, 209, 145, 190, 205, 6, 149, 190, 179, 58, 152, 190, 238, 108, 155, 190, 116, 157, 158, 190, 61, 204, 161, 190, 64, 249, 164, 190, 115, 36, 168, 190, 207, 77, 171, 190, 73, 117, 174, 190, 218, 154, 177, 190, 120, 190, 180, 190, 27, 224, 183, 190, 186, 255, 186, 190, 75, 29, 190, 190, 199, 56, 193, 190, 37, 82, 196, 190, 91, 105, 199, 190, 97, 126, 202, 190, 48, 145, 205, 190, 188, 161, 208, 190, 0, 176, 211, 190, 241, 187, 214, 190, 135, 197, 217, 190, 186, 204, 220, 190, 129, 209, 223, 190, 211, 211, 226, 190, 169, 211, 229, 190, 250, 208, 232, 190, 189, 203, 235, 190, 234, 195, 238, 190, 120, 185, 241, 190, 96, 172, 244, 190, 154, 156, 247, 190, 28, 138, 250, 190, 223, 116, 253, 190, 109, 46, 0, 191, 3, 161, 1, 191, 45, 18, 3, 191, 230, 129, 4, 191, 44, 240, 5, 191, 250, 92, 7, 191, 76, 200, 8, 191, 30, 50, 10, 191, 108, 154, 11, 191, 50, 1, 13, 191, 108, 102, 14, 191, 23, 202, 15, 191, 45, 44, 17, 191, 172, 140, 18, 191, 144, 235, 19, 191, 213, 72, 21, 191, 118, 164, 22, 191, 113, 254, 23, 191, 192, 86, 25, 191, 98, 173, 26, 191, 81, 2, 28, 191, 138, 85, 29, 191, 9, 167, 30, 191, 203, 246, 31, 191, 204, 68, 33, 191, 9, 145, 34, 191, 124, 219, 35, 191, 36, 36, 37, 191, 253, 106, 38, 191, 2, 176, 39, 191, 48, 243, 40, 191, 132, 52, 42, 191, 250, 115, 43, 191, 143, 177, 44, 191, 63, 237, 45, 191, 7, 39, 47, 191, 227, 94, 48, 191, 208, 148, 49, 191, 202, 200, 50, 191, 206, 250, 51, 191, 218, 42, 53, 191, 232, 88, 54, 191, 247, 132, 55, 191, 2, 175, 56, 191, 7, 215, 57, 191, 3, 253, 58, 191, 241, 32, 60, 191, 207, 66, 61, 191, 154, 98, 62, 191, 79, 128, 63, 191, 233, 155, 64, 191, 104, 181, 65, 191, 198, 204, 66, 191, 1, 226, 67, 191, 23, 245, 68, 191, 3, 6, 70, 191, 196, 20, 71, 191, 86, 33, 72, 191, 182, 43, 73, 191, 225, 51, 74, 191, 212, 57, 75, 191, 141, 61, 76, 191, 9, 63, 77, 191, 68, 62, 78, 191, 61, 59, 79, 191, 240, 53, 80, 191, 90, 46, 81, 191, 121, 36, 82, 191, 74, 24, 83, 191, 202, 9, 84, 191, 247, 248, 84, 191, 206, 229, 85, 191, 77, 208, 86, 191, 112, 184, 87, 191, 55, 158, 88, 191, 156, 129, 89, 191, 160, 98, 90, 191, 62, 65, 91, 191, 117, 29, 92, 191, 65, 247, 92, 191, 162, 206, 93, 191, 148, 163, 94, 191, 20, 118, 95, 191, 34, 70, 96, 191, 186, 19, 97, 191, 217, 222, 97, 191, 127, 167, 98, 191, 169, 109, 99, 191, 84, 49, 100, 191, 126, 242, 100, 191, 38, 177, 101, 191, 73, 109, 102, 191, 229, 38, 103, 191, 248, 221, 103, 191, 128, 146, 104, 191, 123, 68, 105, 191, 232, 243, 105, 191, 195, 160, 106, 191, 12, 75, 107, 191, 192, 242, 107, 191, 222, 151, 108, 191, 100, 58, 109, 191, 80, 218, 109, 191, 160, 119, 110, 191, 83, 18, 111, 191, 102, 170, 111, 191, 217, 63, 112, 191, 169, 210, 112, 191, 213, 98, 113, 191, 91, 240, 113, 191, 58, 123, 114, 191, 113, 3, 115, 191, 253, 136, 115, 191, 222, 11, 116, 191, 17, 140, 116, 191, 150, 9, 117, 191, 107, 132, 117, 191, 143, 252, 117, 191, 0, 114, 118, 191, 189, 228, 118, 191, 198, 84, 119, 191, 24, 194, 119, 191, 178, 44, 120, 191, 147, 148, 120, 191, 187, 249, 120, 191, 40, 92, 121, 191, 217, 187, 121, 191, 205, 24, 122, 191, 2, 115, 122, 191, 121, 202, 122, 191, 47, 31, 123, 191, 36, 113, 123, 191, 88, 192, 123, 191, 201, 12, 124, 191, 118, 86, 124, 191, 95, 157, 124, 191, 130, 225, 124, 191, 224, 34, 125, 191, 119, 97, 125, 191, 71, 157, 125, 191, 79, 214, 125, 191, 142, 12, 126, 191, 4, 64, 126, 191, 176, 112, 126, 191, 146, 158, 126, 191, 169, 201, 126, 191, 245, 241, 126, 191, 117, 23, 127, 191, 41, 58, 127, 191, 16, 90, 127, 191, 43, 119, 127, 191, 120, 145, 127, 191, 248, 168, 127, 191, 170, 189, 127, 191, 143, 207, 127, 191, 165, 222, 127, 191, 237, 234, 127, 191, 102, 244, 127, 191, 17, 251, 127, 191, 237, 254, 127, 191, 234, 255, 127, 63, 229, 248, 127, 63, 166, 230, 127, 63, 45, 201, 127, 63, 124, 160, 127, 63, 149, 108, 127, 63, 121, 45, 127, 63, 44, 227, 126, 63, 177, 141, 126, 63, 11, 45, 126, 63, 63, 193, 125, 63, 82, 74, 125, 63, 72, 200, 124, 63, 40, 59, 124, 63, 247, 162, 123, 63, 189, 255, 122, 63, 128, 81, 122, 63, 72, 152, 121, 63, 30, 212, 120, 63, 9, 5, 120, 63, 19, 43, 119, 63, 70, 70, 118, 63, 172, 86, 117, 63, 78, 92, 116, 63, 56, 87, 115, 63, 118, 71, 114, 63, 19, 45, 113, 63, 28, 8, 112, 63, 158, 216, 110, 63, 165, 158, 109, 63, 64, 90, 108, 63, 126, 11, 107, 63, 107, 178, 105, 63, 25, 79, 104, 63, 150, 225, 102, 63, 242, 105, 101, 63, 62, 232, 99, 63, 139, 92, 98, 63, 234, 198, 96, 63, 109, 39, 95, 63, 38, 126, 93, 63, 40, 203, 91, 63, 133, 14, 90, 63, 83, 72, 88, 63, 163, 120, 86, 63, 139, 159, 84, 63, 32, 189, 82, 63, 118, 209, 80, 63, 163, 220, 78, 63, 189, 222, 76, 63, 219, 215, 74, 63, 19, 200, 72, 63, 124, 175, 70, 63, 46, 142, 68, 63, 65, 100, 66, 63, 206, 49, 64, 63, 236, 246, 61, 63, 180, 179, 59, 63, 66, 104, 57, 63, 173, 20, 55, 63, 16, 185, 52, 63, 134, 85, 50, 63, 41, 234, 47, 63, 21, 119, 45, 63, 101, 252, 42, 63, 53, 122, 40, 63, 161, 240, 37, 63, 198, 95, 35, 63, 192, 199, 32, 63, 172, 40, 30, 63, 169, 130, 27, 63, 212, 213, 24, 63, 74, 34, 22, 63, 42, 104, 19, 63, 147, 167, 16, 63, 164, 224, 13, 63, 123, 19, 11, 63, 57, 64, 8, 63, 253, 102, 5, 63, 231, 135, 2, 63, 45, 70, 255, 62, 91, 113, 249, 62, 151, 145, 243, 62, 36, 167, 237, 62, 69, 178, 231, 62, 60, 179, 225, 62, 76, 170, 219, 62, 186, 151, 213, 62, 201, 123, 207, 62, 190, 86, 201, 62, 223, 40, 195, 62, 112, 242, 188, 62, 183, 179, 182, 62, 251, 108, 176, 62, 129, 30, 170, 62, 146, 200, 163, 62, 115, 107, 157, 62, 108, 7, 151, 62, 197, 156, 144, 62, 199, 43, 138, 62, 185, 180, 131, 62, 199, 111, 122, 62, 33, 107, 109, 62, 17, 92, 96, 62, 41, 67, 83, 62, 253, 32, 70, 62, 32, 246, 56, 62, 38, 195, 43, 62, 164, 136, 30, 62, 45, 71, 17, 62, 87, 255, 3, 62, 110, 99, 237, 61, 194, 189, 210, 61, 218, 14, 184, 61, 222, 87, 157, 61, 251, 153, 130, 61, 188, 172, 79, 61, 101, 28, 26, 61, 153, 10, 201, 60, 42, 167, 59, 60, 193, 120, 214, 186, 45, 68, 113, 188, 87, 215, 227, 188, 76, 129, 39, 189, 148, 15, 93, 189, 21, 74, 137, 189, 90, 6, 164, 189, 109, 187, 190, 189, 34, 104, 217, 189, 78, 11, 244, 189, 227, 81, 7, 190, 47, 152, 20, 190, 247, 215, 33, 190, 165, 16, 47, 190, 166, 65, 60, 190, 100, 106, 73, 190, 77, 138, 86, 190, 205, 160, 99, 190, 80, 173, 112, 190, 69, 175, 125, 190, 13, 83, 133, 190, 158, 200, 139, 190, 13, 56, 146, 190, 18, 161, 152, 190, 102, 3, 159, 190, 191, 94, 165, 190, 216, 178, 171, 190, 105, 255, 177, 190, 43, 68, 184, 190, 216, 128, 190, 190, 42, 181, 196, 190, 219, 224, 202, 190, 165, 3, 209, 190, 69, 29, 215, 190, 117, 45, 221, 190, 241, 51, 227, 190, 118, 48, 233, 190, 192, 34, 239, 190, 141, 10, 245, 190, 155, 231, 250, 190, 211, 92, 0, 191, 56, 64, 3, 191, 219, 29, 6, 191, 155, 245, 8, 191, 90, 199, 11, 191, 247, 146, 14, 191, 84, 88, 17, 191, 80, 23, 20, 191, 205, 207, 22, 191, 172, 129, 25, 191, 208, 44, 28, 191, 26, 209, 30, 191, 109, 110, 33, 191, 171, 4, 36, 191, 183, 147, 38, 191, 116, 27, 41, 191, 199, 155, 43, 191, 147, 20, 46, 191, 187, 133, 48, 191, 38, 239, 50, 191, 183, 80, 53, 191, 85, 170, 55, 191, 227, 251, 57, 191, 74, 69, 60, 191, 110, 134, 62, 191, 55, 191, 64, 191, 139, 239, 66, 191, 83, 23, 69, 191, 117, 54, 71, 191, 218, 76, 73, 191, 107, 90, 75, 191, 16, 95, 77, 191, 179, 90, 79, 191, 62, 77, 81, 191, 154, 54, 83, 191, 179, 22, 85, 191, 114, 237, 86, 191, 197, 186, 88, 191, 149, 126, 90, 191, 208, 56, 92, 191, 98, 233, 93, 191, 56, 144, 95, 191, 64, 45, 97, 191, 103, 192, 98, 191, 156, 73, 100, 191, 206, 200, 101, 191, 235, 61, 103, 191, 227, 168, 104, 191, 167, 9, 106, 191, 39, 96, 107, 191, 84, 172, 108, 191, 31, 238, 109, 191, 122, 37, 111, 191, 88, 82, 112, 191, 171, 116, 113, 191, 103, 140, 114, 191, 127, 153, 115, 191, 231, 155, 116, 191, 149, 147, 117, 191, 126, 128, 118, 191, 150, 98, 119, 191, 212, 57, 120, 191, 47, 6, 121, 191, 158, 199, 121, 191, 23, 126, 122, 191, 148, 41, 123, 191, 13, 202, 123, 191, 122, 95, 124, 191, 213, 233, 124, 191, 24, 105, 125, 191, 62, 221, 125, 191, 64, 70, 126, 191, 28, 164, 126, 191, 204, 246, 126, 191, 77, 62, 127, 191, 156, 122, 127, 191, 182, 171, 127, 191, 153, 209, 127, 191, 67, 236, 127, 191, 180, 251, 127, 191, 166, 255, 127, 63, 148, 227, 127, 63, 156, 154, 127, 63, 204, 36, 127, 63, 56, 130, 126, 63, 253, 178, 125, 63, 63, 183, 124, 63, 42, 143, 123, 63, 243, 58, 122, 63, 212, 186, 120, 63, 17, 15, 119, 63, 246, 55, 117, 63, 213, 53, 115, 63, 8, 9, 113, 63, 241, 177, 110, 63, 249, 48, 108, 63, 144, 134, 105, 63, 47, 179, 102, 63, 83, 183, 99, 63, 132, 147, 96, 63, 78, 72, 93, 63, 69, 214, 89, 63, 3, 62, 86, 63, 43, 128, 82, 63, 101, 157, 78, 63, 94, 150, 74, 63, 204, 107, 70, 63, 106, 30, 66, 63, 249, 174, 61, 63, 64, 30, 57, 63, 13, 109, 52, 63, 50, 156, 47, 63, 135, 172, 42, 63, 235, 158, 37, 63, 63, 116, 32, 63, 109, 45, 27, 63, 97, 203, 21, 63, 13, 79, 16, 63, 104, 185, 10, 63, 107, 11, 5, 63, 46, 140, 254, 62, 221, 212, 242, 62, 241, 242, 230, 62, 127, 232, 218, 62, 166, 183, 206, 62, 136, 98, 194, 62, 78, 235, 181, 62, 42, 84, 169, 62, 81, 159, 156, 62, 253, 206, 143, 62, 109, 229, 130, 62, 206, 201, 107, 62, 98, 159, 81, 62, 48, 80, 55, 62, 211, 224, 28, 62, 241, 85, 2, 62, 98, 104, 207, 61, 124, 0, 154, 61, 36, 251, 72, 61, 27, 164, 187, 60, 243, 119, 86, 187, 100, 61, 241, 188, 187, 192, 99, 189, 103, 93, 167, 189, 20, 189, 220, 189, 3, 251, 8, 190, 115, 127, 35, 190, 52, 231, 61, 190, 164, 45, 88, 190, 38, 78, 114, 190, 18, 34, 134, 190, 137, 5, 147, 190, 52, 207, 159, 190, 213, 124, 172, 190, 51, 12, 185, 190, 26, 123, 197, 190, 91, 199, 209, 190, 205, 238, 221, 190, 80, 239, 233, 190, 199, 198, 245, 190, 144, 185, 0, 191, 38, 121, 6, 191, 36, 33, 12, 191, 141, 176, 17, 191, 102, 38, 23, 191, 186, 129, 28, 191, 152, 193, 33, 191, 21, 229, 38, 191, 74, 235, 43, 191, 86, 211, 48, 191, 91, 156, 53, 191, 131, 69, 58, 191, 253, 205, 62, 191, 252, 52, 67, 191, 188, 121, 71, 191, 125, 155, 75, 191, 132, 153, 79, 191, 31, 115, 83, 191, 161, 39, 87, 191, 99, 182, 90, 191, 198, 30, 94, 191, 48, 96, 97, 191, 15, 122, 100, 191, 216, 107, 103, 191, 7, 53, 106, 191, 31, 213, 108, 191, 169, 75, 111, 191, 55, 152, 113, 191, 98, 186, 115, 191, 201, 177, 117, 191, 22, 126, 119, 191, 246, 30, 121, 191, 33, 148, 122, 191, 85, 221, 123, 191, 89, 250, 124, 191, 250, 234, 125, 191, 14, 175, 126, 191, 116, 70, 127, 191, 15, 177, 127, 191, 206, 238, 127, 191, 0, 0, 128, 63, 0, 0, 0, 128, 99, 250, 127, 63, 191, 117, 86, 188, 139, 233, 127, 63, 10, 113, 214, 188, 121, 205, 127, 63, 231, 206, 32, 189, 47, 166, 127, 63, 58, 94, 86, 189, 175, 115, 127, 63, 19, 242, 133, 189, 249, 53, 127, 63, 42, 175, 160, 189, 18, 237, 126, 63, 51, 101, 187, 189, 253, 152, 126, 63, 4, 19, 214, 189, 188, 57, 126, 63, 115, 183, 240, 189, 85, 207, 125, 63, 168, 168, 5, 190, 203, 89, 125, 63, 187, 239, 18, 190, 37, 217, 124, 63, 92, 48, 32, 190, 103, 77, 124, 63, 245, 105, 45, 190, 152, 182, 123, 63, 243, 155, 58, 190, 190, 20, 123, 63, 194, 197, 71, 190, 226, 103, 122, 63, 205, 230, 84, 190, 9, 176, 121, 63, 130, 254, 97, 190, 60, 237, 120, 63, 77, 12, 111, 190, 132, 31, 120, 63, 156, 15, 124, 190, 234, 70, 119, 63, 238, 131, 132, 190, 119, 99, 118, 63, 62, 250, 138, 190, 54, 117, 117, 63, 117, 106, 145, 190, 48, 124, 116, 63, 76, 212, 151, 190, 113, 120, 115, 63, 122, 55, 158, 190, 3, 106, 114, 63, 183, 147, 164, 190, 244, 80, 113, 63, 188, 232, 170, 190, 79, 45, 112, 63, 65, 54, 177, 190, 33, 255, 110, 63, 1, 124, 183, 190, 118, 198, 109, 63, 180, 185, 189, 190, 94, 131, 108, 63, 21, 239, 195, 190, 231, 53, 107, 63, 222, 27, 202, 190, 30, 222, 105, 63, 201, 63, 208, 190, 18, 124, 104, 63, 146, 90, 214, 190, 212, 15, 103, 63, 243, 107, 220, 190, 116, 153, 101, 63, 170, 115, 226, 190, 1, 25, 100, 63, 113, 113, 232, 190, 141, 142, 98, 63, 7, 101, 238, 190, 40, 250, 96, 63, 39, 78, 244, 190, 230, 91, 95, 63, 144, 44, 250, 190, 215, 179, 93, 63, 0, 0, 0, 191, 15, 2, 92, 63, 27, 228, 2, 191, 160, 70, 90, 63, 119, 194, 5, 191, 158, 129, 88, 63, 246, 154, 8, 191, 29, 179, 86, 63, 119, 109, 11, 191, 49, 219, 84, 63, 218, 57, 14, 191, 239, 249, 82, 63, 0, 0, 17, 191, 108, 15, 81, 63, 202, 191, 19, 191, 189, 27, 79, 63, 24, 121, 22, 191, 248, 30, 77, 63, 205, 43, 25, 191, 52, 25, 75, 63, 202, 215, 27, 191, 136, 10, 73, 63, 241, 124, 30, 191, 10, 243, 70, 63, 36, 27, 33, 191, 209, 210, 68, 63, 70, 178, 35, 191, 247, 169, 66, 63, 58, 66, 38, 191, 147, 120, 64, 63, 227, 202, 40, 191, 189, 62, 62, 63, 37, 76, 43, 191, 143, 252, 59, 63, 227, 197, 45, 191, 34, 178, 57, 63, 1, 56, 48, 191, 144, 95, 55, 63, 101, 162, 50, 191, 243, 4, 53, 63, 243, 4, 53, 191, 101, 162, 50, 63, 144, 95, 55, 191, 1, 56, 48, 63, 34, 178, 57, 191, 227, 197, 45, 63, 143, 252, 59, 191, 37, 76, 43, 63, 189, 62, 62, 191, 227, 202, 40, 63, 147, 120, 64, 191, 58, 66, 38, 63, 247, 169, 66, 191, 70, 178, 35, 63, 209, 210, 68, 191, 36, 27, 33, 63, 10, 243, 70, 191, 241, 124, 30, 63, 136, 10, 73, 191, 202, 215, 27, 63, 52, 25, 75, 191, 205, 43, 25, 63, 248, 30, 77, 191, 24, 121, 22, 63, 189, 27, 79, 191, 202, 191, 19, 63, 108, 15, 81, 191, 0, 0, 17, 63, 239, 249, 82, 191, 218, 57, 14, 63, 49, 219, 84, 191, 119, 109, 11, 63, 29, 179, 86, 191, 246, 154, 8, 63, 158, 129, 88, 191, 119, 194, 5, 63, 160, 70, 90, 191, 27, 228, 2, 63, 15, 2, 92, 191, 0, 0, 0, 63, 215, 179, 93, 191, 144, 44, 250, 62, 230, 91, 95, 191, 39, 78, 244, 62, 40, 250, 96, 191, 7, 101, 238, 62, 141, 142, 98, 191, 113, 113, 232, 62, 1, 25, 100, 191, 170, 115, 226, 62, 116, 153, 101, 191, 243, 107, 220, 62, 212, 15, 103, 191, 146, 90, 214, 62, 18, 124, 104, 191, 201, 63, 208, 62, 30, 222, 105, 191, 222, 27, 202, 62, 231, 53, 107, 191, 21, 239, 195, 62, 94, 131, 108, 191, 180, 185, 189, 62, 118, 198, 109, 191, 1, 124, 183, 62, 33, 255, 110, 191, 65, 54, 177, 62, 79, 45, 112, 191, 188, 232, 170, 62, 244, 80, 113, 191, 183, 147, 164, 62, 3, 106, 114, 191, 122, 55, 158, 62, 113, 120, 115, 191, 76, 212, 151, 62, 48, 124, 116, 191, 117, 106, 145, 62, 54, 117, 117, 191, 62, 250, 138, 62, 119, 99, 118, 191, 238, 131, 132, 62, 234, 70, 119, 191, 156, 15, 124, 62, 132, 31, 120, 191, 77, 12, 111, 62, 60, 237, 120, 191, 130, 254, 97, 62, 9, 176, 121, 191, 205, 230, 84, 62, 226, 103, 122, 191, 194, 197, 71, 62, 190, 20, 123, 191, 243, 155, 58, 62, 152, 182, 123, 191, 245, 105, 45, 62, 103, 77, 124, 191, 92, 48, 32, 62, 37, 217, 124, 191, 187, 239, 18, 62, 203, 89, 125, 191, 168, 168, 5, 62, 85, 207, 125, 191, 115, 183, 240, 61, 188, 57, 126, 191, 4, 19, 214, 61, 253, 152, 126, 191, 51, 101, 187, 61, 18, 237, 126, 191, 42, 175, 160, 61, 249, 53, 127, 191, 19, 242, 133, 61, 175, 115, 127, 191, 58, 94, 86, 61, 47, 166, 127, 191, 231, 206, 32, 61, 121, 205, 127, 191, 10, 113, 214, 60, 139, 233, 127, 191, 191, 117, 86, 60, 99, 250, 127, 191, 0, 48, 141, 36, 0, 0, 128, 191, 191, 117, 86, 188, 99, 250, 127, 191, 10, 113, 214, 188, 139, 233, 127, 191, 231, 206, 32, 189, 121, 205, 127, 191, 58, 94, 86, 189, 47, 166, 127, 191, 19, 242, 133, 189, 175, 115, 127, 191, 42, 175, 160, 189, 249, 53, 127, 191, 51, 101, 187, 189, 18, 237, 126, 191, 4, 19, 214, 189, 253, 152, 126, 191, 115, 183, 240, 189, 188, 57, 126, 191, 168, 168, 5, 190, 85, 207, 125, 191, 187, 239, 18, 190, 203, 89, 125, 191, 92, 48, 32, 190, 37, 217, 124, 191, 245, 105, 45, 190, 103, 77, 124, 191, 243, 155, 58, 190, 152, 182, 123, 191, 194, 197, 71, 190, 190, 20, 123, 191, 205, 230, 84, 190, 226, 103, 122, 191, 130, 254, 97, 190, 9, 176, 121, 191, 77, 12, 111, 190, 60, 237, 120, 191, 156, 15, 124, 190, 132, 31, 120, 191, 238, 131, 132, 190, 234, 70, 119, 191, 62, 250, 138, 190, 119, 99, 118, 191, 117, 106, 145, 190, 54, 117, 117, 191, 76, 212, 151, 190, 48, 124, 116, 191, 122, 55, 158, 190, 113, 120, 115, 191, 183, 147, 164, 190, 3, 106, 114, 191, 188, 232, 170, 190, 244, 80, 113, 191, 65, 54, 177, 190, 79, 45, 112, 191, 1, 124, 183, 190, 33, 255, 110, 191, 180, 185, 189, 190, 118, 198, 109, 191, 21, 239, 195, 190, 94, 131, 108, 191, 222, 27, 202, 190, 231, 53, 107, 191, 201, 63, 208, 190, 30, 222, 105, 191, 146, 90, 214, 190, 18, 124, 104, 191, 243, 107, 220, 190, 212, 15, 103, 191, 170, 115, 226, 190, 116, 153, 101, 191, 113, 113, 232, 190, 1, 25, 100, 191, 7, 101, 238, 190, 141, 142, 98, 191, 39, 78, 244, 190, 40, 250, 96, 191, 144, 44, 250, 190, 230, 91, 95, 191, 0, 0, 0, 191, 215, 179, 93, 191, 27, 228, 2, 191, 15, 2, 92, 191, 119, 194, 5, 191, 160, 70, 90, 191, 246, 154, 8, 191, 158, 129, 88, 191, 119, 109, 11, 191, 29, 179, 86, 191, 218, 57, 14, 191, 49, 219, 84, 191, 0, 0, 17, 191, 239, 249, 82, 191, 202, 191, 19, 191, 108, 15, 81, 191, 24, 121, 22, 191, 189, 27, 79, 191, 205, 43, 25, 191, 248, 30, 77, 191, 202, 215, 27, 191, 52, 25, 75, 191, 241, 124, 30, 191, 136, 10, 73, 191, 36, 27, 33, 191, 10, 243, 70, 191, 70, 178, 35, 191, 209, 210, 68, 191, 58, 66, 38, 191, 247, 169, 66, 191, 227, 202, 40, 191, 147, 120, 64, 191, 37, 76, 43, 191, 189, 62, 62, 191, 227, 197, 45, 191, 143, 252, 59, 191, 1, 56, 48, 191, 34, 178, 57, 191, 101, 162, 50, 191, 144, 95, 55, 191, 243, 4, 53, 191, 243, 4, 53, 191, 144, 95, 55, 191, 101, 162, 50, 191, 34, 178, 57, 191, 1, 56, 48, 191, 143, 252, 59, 191, 227, 197, 45, 191, 189, 62, 62, 191, 37, 76, 43, 191, 147, 120, 64, 191, 227, 202, 40, 191, 247, 169, 66, 191, 58, 66, 38, 191, 209, 210, 68, 191, 70, 178, 35, 191, 10, 243, 70, 191, 36, 27, 33, 191, 136, 10, 73, 191, 241, 124, 30, 191, 52, 25, 75, 191, 202, 215, 27, 191, 248, 30, 77, 191, 205, 43, 25, 191, 189, 27, 79, 191, 24, 121, 22, 191, 108, 15, 81, 191, 202, 191, 19, 191, 239, 249, 82, 191, 0, 0, 17, 191, 49, 219, 84, 191, 218, 57, 14, 191, 29, 179, 86, 191, 119, 109, 11, 191, 158, 129, 88, 191, 246, 154, 8, 191, 160, 70, 90, 191, 119, 194, 5, 191, 15, 2, 92, 191, 27, 228, 2, 191, 215, 179, 93, 191, 0, 0, 0, 191, 230, 91, 95, 191, 144, 44, 250, 190, 40, 250, 96, 191, 39, 78, 244, 190, 141, 142, 98, 191, 7, 101, 238, 190, 1, 25, 100, 191, 113, 113, 232, 190, 116, 153, 101, 191, 170, 115, 226, 190, 212, 15, 103, 191, 243, 107, 220, 190, 18, 124, 104, 191, 146, 90, 214, 190, 30, 222, 105, 191, 201, 63, 208, 190, 231, 53, 107, 191, 222, 27, 202, 190, 94, 131, 108, 191, 21, 239, 195, 190, 118, 198, 109, 191, 180, 185, 189, 190, 33, 255, 110, 191, 1, 124, 183, 190, 79, 45, 112, 191, 65, 54, 177, 190, 244, 80, 113, 191, 188, 232, 170, 190, 3, 106, 114, 191, 183, 147, 164, 190, 113, 120, 115, 191, 122, 55, 158, 190, 48, 124, 116, 191, 76, 212, 151, 190, 54, 117, 117, 191, 117, 106, 145, 190, 119, 99, 118, 191, 62, 250, 138, 190, 234, 70, 119, 191, 238, 131, 132, 190, 132, 31, 120, 191, 156, 15, 124, 190, 60, 237, 120, 191, 77, 12, 111, 190, 9, 176, 121, 191, 130, 254, 97, 190, 226, 103, 122, 191, 205, 230, 84, 190, 190, 20, 123, 191, 194, 197, 71, 190, 152, 182, 123, 191, 243, 155, 58, 190, 103, 77, 124, 191, 245, 105, 45, 190, 37, 217, 124, 191, 92, 48, 32, 190, 203, 89, 125, 191, 187, 239, 18, 190, 85, 207, 125, 191, 168, 168, 5, 190, 188, 57, 126, 191, 115, 183, 240, 189, 253, 152, 126, 191, 4, 19, 214, 189, 18, 237, 126, 191, 51, 101, 187, 189, 249, 53, 127, 191, 42, 175, 160, 189, 175, 115, 127, 191, 19, 242, 133, 189, 47, 166, 127, 191, 58, 94, 86, 189, 121, 205, 127, 191, 231, 206, 32, 189, 139, 233, 127, 191, 10, 113, 214, 188, 99, 250, 127, 191, 191, 117, 86, 188, 0, 0, 128, 191, 0, 48, 13, 165, 99, 250, 127, 191, 191, 117, 86, 60, 139, 233, 127, 191, 10, 113, 214, 60, 121, 205, 127, 191, 231, 206, 32, 61, 47, 166, 127, 191, 58, 94, 86, 61, 175, 115, 127, 191, 19, 242, 133, 61, 249, 53, 127, 191, 42, 175, 160, 61, 18, 237, 126, 191, 51, 101, 187, 61, 253, 152, 126, 191, 4, 19, 214, 61, 188, 57, 126, 191, 115, 183, 240, 61, 85, 207, 125, 191, 168, 168, 5, 62, 203, 89, 125, 191, 187, 239, 18, 62, 37, 217, 124, 191, 92, 48, 32, 62, 103, 77, 124, 191, 245, 105, 45, 62, 152, 182, 123, 191, 243, 155, 58, 62, 190, 20, 123, 191, 194, 197, 71, 62, 226, 103, 122, 191, 205, 230, 84, 62, 9, 176, 121, 191, 130, 254, 97, 62, 60, 237, 120, 191, 77, 12, 111, 62, 132, 31, 120, 191, 156, 15, 124, 62, 234, 70, 119, 191, 238, 131, 132, 62, 119, 99, 118, 191, 62, 250, 138, 62, 54, 117, 117, 191, 117, 106, 145, 62, 48, 124, 116, 191, 76, 212, 151, 62, 113, 120, 115, 191, 122, 55, 158, 62, 3, 106, 114, 191, 183, 147, 164, 62, 244, 80, 113, 191, 188, 232, 170, 62, 79, 45, 112, 191, 65, 54, 177, 62, 33, 255, 110, 191, 1, 124, 183, 62, 118, 198, 109, 191, 180, 185, 189, 62, 94, 131, 108, 191, 21, 239, 195, 62, 231, 53, 107, 191, 222, 27, 202, 62, 30, 222, 105, 191, 201, 63, 208, 62, 18, 124, 104, 191, 146, 90, 214, 62, 212, 15, 103, 191, 243, 107, 220, 62, 116, 153, 101, 191, 170, 115, 226, 62, 1, 25, 100, 191, 113, 113, 232, 62, 141, 142, 98, 191, 7, 101, 238, 62, 40, 250, 96, 191, 39, 78, 244, 62, 230, 91, 95, 191, 144, 44, 250, 62, 215, 179, 93, 191, 0, 0, 0, 63, 15, 2, 92, 191, 27, 228, 2, 63, 160, 70, 90, 191, 119, 194, 5, 63, 158, 129, 88, 191, 246, 154, 8, 63, 29, 179, 86, 191, 119, 109, 11, 63, 49, 219, 84, 191, 218, 57, 14, 63, 239, 249, 82, 191, 0, 0, 17, 63, 108, 15, 81, 191, 202, 191, 19, 63, 189, 27, 79, 191, 24, 121, 22, 63, 248, 30, 77, 191, 205, 43, 25, 63, 52, 25, 75, 191, 202, 215, 27, 63, 136, 10, 73, 191, 241, 124, 30, 63, 10, 243, 70, 191, 36, 27, 33, 63, 209, 210, 68, 191, 70, 178, 35, 63, 247, 169, 66, 191, 58, 66, 38, 63, 147, 120, 64, 191, 227, 202, 40, 63, 189, 62, 62, 191, 37, 76, 43, 63, 143, 252, 59, 191, 227, 197, 45, 63, 34, 178, 57, 191, 1, 56, 48, 63, 144, 95, 55, 191, 101, 162, 50, 63, 243, 4, 53, 191, 243, 4, 53, 63, 101, 162, 50, 191, 144, 95, 55, 63, 1, 56, 48, 191, 34, 178, 57, 63, 227, 197, 45, 191, 143, 252, 59, 63, 37, 76, 43, 191, 189, 62, 62, 63, 227, 202, 40, 191, 147, 120, 64, 63, 58, 66, 38, 191, 247, 169, 66, 63, 70, 178, 35, 191, 209, 210, 68, 63, 36, 27, 33, 191, 10, 243, 70, 63, 241, 124, 30, 191, 136, 10, 73, 63, 202, 215, 27, 191, 52, 25, 75, 63, 205, 43, 25, 191, 248, 30, 77, 63, 24, 121, 22, 191, 189, 27, 79, 63, 202, 191, 19, 191, 108, 15, 81, 63, 0, 0, 17, 191, 239, 249, 82, 63, 218, 57, 14, 191, 49, 219, 84, 63, 119, 109, 11, 191, 29, 179, 86, 63, 246, 154, 8, 191, 158, 129, 88, 63, 119, 194, 5, 191, 160, 70, 90, 63, 27, 228, 2, 191, 15, 2, 92, 63, 0, 0, 0, 191, 215, 179, 93, 63, 144, 44, 250, 190, 230, 91, 95, 63, 39, 78, 244, 190, 40, 250, 96, 63, 7, 101, 238, 190, 141, 142, 98, 63, 113, 113, 232, 190, 1, 25, 100, 63, 170, 115, 226, 190, 116, 153, 101, 63, 243, 107, 220, 190, 212, 15, 103, 63, 146, 90, 214, 190, 18, 124, 104, 63, 201, 63, 208, 190, 30, 222, 105, 63, 222, 27, 202, 190, 231, 53, 107, 63, 21, 239, 195, 190, 94, 131, 108, 63, 180, 185, 189, 190, 118, 198, 109, 63, 1, 124, 183, 190, 33, 255, 110, 63, 65, 54, 177, 190, 79, 45, 112, 63, 188, 232, 170, 190, 244, 80, 113, 63, 183, 147, 164, 190, 3, 106, 114, 63, 122, 55, 158, 190, 113, 120, 115, 63, 76, 212, 151, 190, 48, 124, 116, 63, 117, 106, 145, 190, 54, 117, 117, 63, 62, 250, 138, 190, 119, 99, 118, 63, 238, 131, 132, 190, 234, 70, 119, 63, 156, 15, 124, 190, 132, 31, 120, 63, 77, 12, 111, 190, 60, 237, 120, 63, 130, 254, 97, 190, 9, 176, 121, 63, 205, 230, 84, 190, 226, 103, 122, 63, 194, 197, 71, 190, 190, 20, 123, 63, 243, 155, 58, 190, 152, 182, 123, 63, 245, 105, 45, 190, 103, 77, 124, 63, 92, 48, 32, 190, 37, 217, 124, 63, 187, 239, 18, 190, 203, 89, 125, 63, 168, 168, 5, 190, 85, 207, 125, 63, 115, 183, 240, 189, 188, 57, 126, 63, 4, 19, 214, 189, 253, 152, 126, 63, 51, 101, 187, 189, 18, 237, 126, 63, 42, 175, 160, 189, 249, 53, 127, 63, 19, 242, 133, 189, 175, 115, 127, 63, 58, 94, 86, 189, 47, 166, 127, 63, 231, 206, 32, 189, 121, 205, 127, 63, 10, 113, 214, 188, 139, 233, 127, 63, 191, 117, 86, 188, 99, 250, 127, 63, 0, 200, 83, 165, 0, 0, 128, 63, 191, 117, 86, 60, 99, 250, 127, 63, 10, 113, 214, 60, 139, 233, 127, 63, 231, 206, 32, 61, 121, 205, 127, 63, 58, 94, 86, 61, 47, 166, 127, 63, 19, 242, 133, 61, 175, 115, 127, 63, 42, 175, 160, 61, 249, 53, 127, 63, 51, 101, 187, 61, 18, 237, 126, 63, 4, 19, 214, 61, 253, 152, 126, 63, 115, 183, 240, 61, 188, 57, 126, 63, 168, 168, 5, 62, 85, 207, 125, 63, 187, 239, 18, 62, 203, 89, 125, 63, 92, 48, 32, 62, 37, 217, 124, 63, 245, 105, 45, 62, 103, 77, 124, 63, 243, 155, 58, 62, 152, 182, 123, 63, 194, 197, 71, 62, 190, 20, 123, 63, 205, 230, 84, 62, 226, 103, 122, 63, 130, 254, 97, 62, 9, 176, 121, 63, 77, 12, 111, 62, 60, 237, 120, 63, 156, 15, 124, 62, 132, 31, 120, 63, 238, 131, 132, 62, 234, 70, 119, 63, 62, 250, 138, 62, 119, 99, 118, 63, 117, 106, 145, 62, 54, 117, 117, 63, 76, 212, 151, 62, 48, 124, 116, 63, 122, 55, 158, 62, 113, 120, 115, 63, 183, 147, 164, 62, 3, 106, 114, 63, 188, 232, 170, 62, 244, 80, 113, 63, 65, 54, 177, 62, 79, 45, 112, 63, 1, 124, 183, 62, 33, 255, 110, 63, 180, 185, 189, 62, 118, 198, 109, 63, 21, 239, 195, 62, 94, 131, 108, 63, 222, 27, 202, 62, 231, 53, 107, 63, 201, 63, 208, 62, 30, 222, 105, 63, 146, 90, 214, 62, 18, 124, 104, 63, 243, 107, 220, 62, 212, 15, 103, 63, 170, 115, 226, 62, 116, 153, 101, 63, 113, 113, 232, 62, 1, 25, 100, 63, 7, 101, 238, 62, 141, 142, 98, 63, 39, 78, 244, 62, 40, 250, 96, 63, 144, 44, 250, 62, 230, 91, 95, 63, 0, 0, 0, 63, 215, 179, 93, 63, 27, 228, 2, 63, 15, 2, 92, 63, 119, 194, 5, 63, 160, 70, 90, 63, 246, 154, 8, 63, 158, 129, 88, 63, 119, 109, 11, 63, 29, 179, 86, 63, 218, 57, 14, 63, 49, 219, 84, 63, 0, 0, 17, 63, 239, 249, 82, 63, 202, 191, 19, 63, 108, 15, 81, 63, 24, 121, 22, 63, 189, 27, 79, 63, 205, 43, 25, 63, 248, 30, 77, 63, 202, 215, 27, 63, 52, 25, 75, 63, 241, 124, 30, 63, 136, 10, 73, 63, 36, 27, 33, 63, 10, 243, 70, 63, 70, 178, 35, 63, 209, 210, 68, 63, 58, 66, 38, 63, 247, 169, 66, 63, 227, 202, 40, 63, 147, 120, 64, 63, 37, 76, 43, 63, 189, 62, 62, 63, 227, 197, 45, 63, 143, 252, 59, 63, 1, 56, 48, 63, 34, 178, 57, 63, 101, 162, 50, 63, 144, 95, 55, 63, 243, 4, 53, 63, 243, 4, 53, 63, 144, 95, 55, 63, 101, 162, 50, 63, 34, 178, 57, 63, 1, 56, 48, 63, 143, 252, 59, 63, 227, 197, 45, 63, 189, 62, 62, 63, 37, 76, 43, 63, 147, 120, 64, 63, 227, 202, 40, 63, 247, 169, 66, 63, 58, 66, 38, 63, 209, 210, 68, 63, 70, 178, 35, 63, 10, 243, 70, 63, 36, 27, 33, 63, 136, 10, 73, 63, 241, 124, 30, 63, 52, 25, 75, 63, 202, 215, 27, 63, 248, 30, 77, 63, 205, 43, 25, 63, 189, 27, 79, 63, 24, 121, 22, 63, 108, 15, 81, 63, 202, 191, 19, 63, 239, 249, 82, 63, 0, 0, 17, 63, 49, 219, 84, 63, 218, 57, 14, 63, 29, 179, 86, 63, 119, 109, 11, 63, 158, 129, 88, 63, 246, 154, 8, 63, 160, 70, 90, 63, 119, 194, 5, 63, 15, 2, 92, 63, 27, 228, 2, 63, 215, 179, 93, 63, 0, 0, 0, 63, 230, 91, 95, 63, 144, 44, 250, 62, 40, 250, 96, 63, 39, 78, 244, 62, 141, 142, 98, 63, 7, 101, 238, 62, 1, 25, 100, 63, 113, 113, 232, 62, 116, 153, 101, 63, 170, 115, 226, 62, 212, 15, 103, 63, 243, 107, 220, 62, 18, 124, 104, 63, 146, 90, 214, 62, 30, 222, 105, 63, 201, 63, 208, 62, 231, 53, 107, 63, 222, 27, 202, 62, 94, 131, 108, 63, 21, 239, 195, 62, 118, 198, 109, 63, 180, 185, 189, 62, 33, 255, 110, 63, 1, 124, 183, 62, 79, 45, 112, 63, 65, 54, 177, 62, 244, 80, 113, 63, 188, 232, 170, 62, 3, 106, 114, 63, 183, 147, 164, 62, 113, 120, 115, 63, 122, 55, 158, 62, 48, 124, 116, 63, 76, 212, 151, 62, 54, 117, 117, 63, 117, 106, 145, 62, 119, 99, 118, 63, 62, 250, 138, 62, 234, 70, 119, 63, 238, 131, 132, 62, 132, 31, 120, 63, 156, 15, 124, 62, 60, 237, 120, 63, 77, 12, 111, 62, 9, 176, 121, 63, 130, 254, 97, 62, 226, 103, 122, 63, 205, 230, 84, 62, 190, 20, 123, 63, 194, 197, 71, 62, 152, 182, 123, 63, 243, 155, 58, 62, 103, 77, 124, 63, 245, 105, 45, 62, 37, 217, 124, 63, 92, 48, 32, 62, 203, 89, 125, 63, 187, 239, 18, 62, 85, 207, 125, 63, 168, 168, 5, 62, 188, 57, 126, 63, 115, 183, 240, 61, 253, 152, 126, 63, 4, 19, 214, 61, 18, 237, 126, 63, 51, 101, 187, 61, 249, 53, 127, 63, 42, 175, 160, 61, 175, 115, 127, 63, 19, 242, 133, 61, 47, 166, 127, 63, 58, 94, 86, 61, 121, 205, 127, 63, 231, 206, 32, 61, 139, 233, 127, 63, 10, 113, 214, 60, 99, 250, 127, 63, 191, 117, 86, 60, 0, 0, 206, 64, 0, 0, 200, 64, 0, 0, 184, 64, 0, 0, 170, 64, 0, 0, 162, 64, 0, 0, 154, 64, 0, 0, 144, 64, 0, 0, 140, 64, 0, 0, 156, 64, 0, 0, 150, 64, 0, 0, 146, 64, 0, 0, 142, 64, 0, 0, 156, 64, 0, 0, 148, 64, 0, 0, 138, 64, 0, 0, 144, 64, 0, 0, 140, 64, 0, 0, 148, 64, 0, 0, 152, 64, 0, 0, 142, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 102, 63, 0, 0, 76, 63, 0, 0, 38, 63, 0, 0, 0, 63, 0, 134, 107, 63, 0, 20, 46, 63, 0, 112, 189, 62, 0, 208, 76, 62, 15, 0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 226, 92, 0, 0, 234, 92, 0, 0, 250, 92, 0, 0, 26, 93, 0, 0, 66, 93, 0, 0, 146, 93, 0, 0, 32, 0, 10, 0, 20, 46, 100, 1, 50, 94, 0, 0, 114, 95, 0, 0, 178, 95, 0, 0, 196, 95, 0, 0, 100, 96, 0, 0, 172, 96, 0, 0, 12, 85, 0, 0, 32, 0, 16, 0, 102, 38, 171, 1, 244, 96, 0, 0, 244, 98, 0, 0, 52, 99, 0, 0, 82, 99, 0, 0, 82, 100, 0, 0, 154, 100, 0, 0, 34, 85, 0, 0, 44, 101, 0, 0, 47, 101, 0, 0, 8, 0, 0, 0, 4, 0, 0, 0, 225, 122, 84, 63, 246, 40, 92, 63, 128, 74, 0, 0, 16, 0, 0, 0, 4, 0, 0, 0, 154, 153, 89, 63, 174, 71, 97, 63, 128, 74, 0, 0, 32, 0, 0, 0, 4, 0, 0, 0, 193, 202, 97, 63, 195, 245, 104, 63, 128, 74, 0, 0, 48, 0, 0, 0, 8, 0, 0, 0, 184, 30, 101, 63, 131, 192, 106, 63, 136, 74, 0, 0, 64, 0, 0, 0, 8, 0, 0, 0, 168, 198, 107, 63, 215, 163, 112, 63, 136, 74, 0, 0, 80, 0, 0, 0, 16, 0, 0, 0, 49, 8, 108, 63, 215, 163, 112, 63, 144, 74, 0, 0, 96, 0, 0, 0, 16, 0, 0, 0, 215, 163, 112, 63, 133, 235, 113, 63, 144, 74, 0, 0, 128, 0, 0, 0, 16, 0, 0, 0, 51, 51, 115, 63, 51, 51, 115, 63, 144, 74, 0, 0, 160, 0, 0, 0, 16, 0, 0, 0, 143, 194, 117, 63, 143, 194, 117, 63, 144, 74, 0, 0, 192, 0, 0, 0, 32, 0, 0, 0, 217, 206, 119, 63, 217, 206, 119, 63, 152, 74, 0, 0, 0, 1, 0, 0, 32, 0, 0, 0, 154, 153, 121, 63, 154, 153, 121, 63, 152, 74, 0, 0, 104, 4, 0, 0, 32, 0, 0, 0, 72, 3, 0, 0, 32, 0, 0, 0, 40, 2, 0, 0, 32, 0, 0, 0, 8, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 202, 69, 27, 76, 255, 82, 130, 90, 179, 98, 162, 107, 96, 117, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 10, 0, 12, 0, 14, 0, 16, 0, 20, 0, 24, 0, 28, 0, 34, 0, 40, 0, 48, 0, 60, 0, 78, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 8, 0, 8, 0, 16, 0, 16, 0, 16, 0, 21, 0, 21, 0, 24, 0, 29, 0, 34, 0, 36, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 41, 0, 41, 0, 41, 0, 82, 0, 82, 0, 123, 0, 164, 0, 200, 0, 222, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41, 0, 41, 0, 41, 0, 41, 0, 123, 0, 123, 0, 123, 0, 164, 0, 164, 0, 240, 0, 10, 1, 27, 1, 39, 1, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 123, 0, 123, 0, 123, 0, 123, 0, 240, 0, 240, 0, 240, 0, 10, 1, 10, 1, 49, 1, 62, 1, 72, 1, 80, 1, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 240, 0, 240, 0, 240, 0, 240, 0, 49, 1, 49, 1, 49, 1, 62, 1, 62, 1, 87, 1, 95, 1, 102, 1, 108, 1, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 49, 1, 49, 1, 49, 1, 49, 1, 87, 1, 87, 1, 87, 1, 95, 1, 95, 1, 114, 1, 120, 1, 126, 1, 131, 1, 0, 0, 12, 0, 24, 0, 36, 0, 48, 0, 4, 0, 16, 0, 28, 0, 40, 0, 52, 0, 8, 0, 20, 0, 32, 0, 44, 0, 56, 0, 1, 0, 13, 0, 25, 0, 37, 0, 49, 0, 5, 0, 17, 0, 29, 0, 41, 0, 53, 0, 9, 0, 21, 0, 33, 0, 45, 0, 57, 0, 2, 0, 14, 0, 26, 0, 38, 0, 50, 0, 6, 0, 18, 0, 30, 0, 42, 0, 54, 0, 10, 0, 22, 0, 34, 0, 46, 0, 58, 0, 3, 0, 15, 0, 27, 0, 39, 0, 51, 0, 7, 0, 19, 0, 31, 0, 43, 0, 55, 0, 11, 0, 23, 0, 35, 0, 47, 0, 59, 0, 0, 0, 24, 0, 48, 0, 72, 0, 96, 0, 8, 0, 32, 0, 56, 0, 80, 0, 104, 0, 16, 0, 40, 0, 64, 0, 88, 0, 112, 0, 4, 0, 28, 0, 52, 0, 76, 0, 100, 0, 12, 0, 36, 0, 60, 0, 84, 0, 108, 0, 20, 0, 44, 0, 68, 0, 92, 0, 116, 0, 1, 0, 25, 0, 49, 0, 73, 0, 97, 0, 9, 0, 33, 0, 57, 0, 81, 0, 105, 0, 17, 0, 41, 0, 65, 0, 89, 0, 113, 0, 5, 0, 29, 0, 53, 0, 77, 0, 101, 0, 13, 0, 37, 0, 61, 0, 85, 0, 109, 0, 21, 0, 45, 0, 69, 0, 93, 0, 117, 0, 2, 0, 26, 0, 50, 0, 74, 0, 98, 0, 10, 0, 34, 0, 58, 0, 82, 0, 106, 0, 18, 0, 42, 0, 66, 0, 90, 0, 114, 0, 6, 0, 30, 0, 54, 0, 78, 0, 102, 0, 14, 0, 38, 0, 62, 0, 86, 0, 110, 0, 22, 0, 46, 0, 70, 0, 94, 0, 118, 0, 3, 0, 27, 0, 51, 0, 75, 0, 99, 0, 11, 0, 35, 0, 59, 0, 83, 0, 107, 0, 19, 0, 43, 0, 67, 0, 91, 0, 115, 0, 7, 0, 31, 0, 55, 0, 79, 0, 103, 0, 15, 0, 39, 0, 63, 0, 87, 0, 111, 0, 23, 0, 47, 0, 71, 0, 95, 0, 119, 0, 0, 0, 48, 0, 96, 0, 144, 0, 192, 0, 16, 0, 64, 0, 112, 0, 160, 0, 208, 0, 32, 0, 80, 0, 128, 0, 176, 0, 224, 0, 4, 0, 52, 0, 100, 0, 148, 0, 196, 0, 20, 0, 68, 0, 116, 0, 164, 0, 212, 0, 36, 0, 84, 0, 132, 0, 180, 0, 228, 0, 8, 0, 56, 0, 104, 0, 152, 0, 200, 0, 24, 0, 72, 0, 120, 0, 168, 0, 216, 0, 40, 0, 88, 0, 136, 0, 184, 0, 232, 0, 12, 0, 60, 0, 108, 0, 156, 0, 204, 0, 28, 0, 76, 0, 124, 0, 172, 0, 220, 0, 44, 0, 92, 0, 140, 0, 188, 0, 236, 0, 1, 0, 49, 0, 97, 0, 145, 0, 193, 0, 17, 0, 65, 0, 113, 0, 161, 0, 209, 0, 33, 0, 81, 0, 129, 0, 177, 0, 225, 0, 5, 0, 53, 0, 101, 0, 149, 0, 197, 0, 21, 0, 69, 0, 117, 0, 165], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 10240);
allocate([213, 0, 37, 0, 85, 0, 133, 0, 181, 0, 229, 0, 9, 0, 57, 0, 105, 0, 153, 0, 201, 0, 25, 0, 73, 0, 121, 0, 169, 0, 217, 0, 41, 0, 89, 0, 137, 0, 185, 0, 233, 0, 13, 0, 61, 0, 109, 0, 157, 0, 205, 0, 29, 0, 77, 0, 125, 0, 173, 0, 221, 0, 45, 0, 93, 0, 141, 0, 189, 0, 237, 0, 2, 0, 50, 0, 98, 0, 146, 0, 194, 0, 18, 0, 66, 0, 114, 0, 162, 0, 210, 0, 34, 0, 82, 0, 130, 0, 178, 0, 226, 0, 6, 0, 54, 0, 102, 0, 150, 0, 198, 0, 22, 0, 70, 0, 118, 0, 166, 0, 214, 0, 38, 0, 86, 0, 134, 0, 182, 0, 230, 0, 10, 0, 58, 0, 106, 0, 154, 0, 202, 0, 26, 0, 74, 0, 122, 0, 170, 0, 218, 0, 42, 0, 90, 0, 138, 0, 186, 0, 234, 0, 14, 0, 62, 0, 110, 0, 158, 0, 206, 0, 30, 0, 78, 0, 126, 0, 174, 0, 222, 0, 46, 0, 94, 0, 142, 0, 190, 0, 238, 0, 3, 0, 51, 0, 99, 0, 147, 0, 195, 0, 19, 0, 67, 0, 115, 0, 163, 0, 211, 0, 35, 0, 83, 0, 131, 0, 179, 0, 227, 0, 7, 0, 55, 0, 103, 0, 151, 0, 199, 0, 23, 0, 71, 0, 119, 0, 167, 0, 215, 0, 39, 0, 87, 0, 135, 0, 183, 0, 231, 0, 11, 0, 59, 0, 107, 0, 155, 0, 203, 0, 27, 0, 75, 0, 123, 0, 171, 0, 219, 0, 43, 0, 91, 0, 139, 0, 187, 0, 235, 0, 15, 0, 63, 0, 111, 0, 159, 0, 207, 0, 31, 0, 79, 0, 127, 0, 175, 0, 223, 0, 47, 0, 95, 0, 143, 0, 191, 0, 239, 0, 0, 0, 96, 0, 192, 0, 32, 1, 128, 1, 32, 0, 128, 0, 224, 0, 64, 1, 160, 1, 64, 0, 160, 0, 0, 1, 96, 1, 192, 1, 8, 0, 104, 0, 200, 0, 40, 1, 136, 1, 40, 0, 136, 0, 232, 0, 72, 1, 168, 1, 72, 0, 168, 0, 8, 1, 104, 1, 200, 1, 16, 0, 112, 0, 208, 0, 48, 1, 144, 1, 48, 0, 144, 0, 240, 0, 80, 1, 176, 1, 80, 0, 176, 0, 16, 1, 112, 1, 208, 1, 24, 0, 120, 0, 216, 0, 56, 1, 152, 1, 56, 0, 152, 0, 248, 0, 88, 1, 184, 1, 88, 0, 184, 0, 24, 1, 120, 1, 216, 1, 4, 0, 100, 0, 196, 0, 36, 1, 132, 1, 36, 0, 132, 0, 228, 0, 68, 1, 164, 1, 68, 0, 164, 0, 4, 1, 100, 1, 196, 1, 12, 0, 108, 0, 204, 0, 44, 1, 140, 1, 44, 0, 140, 0, 236, 0, 76, 1, 172, 1, 76, 0, 172, 0, 12, 1, 108, 1, 204, 1, 20, 0, 116, 0, 212, 0, 52, 1, 148, 1, 52, 0, 148, 0, 244, 0, 84, 1, 180, 1, 84, 0, 180, 0, 20, 1, 116, 1, 212, 1, 28, 0, 124, 0, 220, 0, 60, 1, 156, 1, 60, 0, 156, 0, 252, 0, 92, 1, 188, 1, 92, 0, 188, 0, 28, 1, 124, 1, 220, 1, 1, 0, 97, 0, 193, 0, 33, 1, 129, 1, 33, 0, 129, 0, 225, 0, 65, 1, 161, 1, 65, 0, 161, 0, 1, 1, 97, 1, 193, 1, 9, 0, 105, 0, 201, 0, 41, 1, 137, 1, 41, 0, 137, 0, 233, 0, 73, 1, 169, 1, 73, 0, 169, 0, 9, 1, 105, 1, 201, 1, 17, 0, 113, 0, 209, 0, 49, 1, 145, 1, 49, 0, 145, 0, 241, 0, 81, 1, 177, 1, 81, 0, 177, 0, 17, 1, 113, 1, 209, 1, 25, 0, 121, 0, 217, 0, 57, 1, 153, 1, 57, 0, 153, 0, 249, 0, 89, 1, 185, 1, 89, 0, 185, 0, 25, 1, 121, 1, 217, 1, 5, 0, 101, 0, 197, 0, 37, 1, 133, 1, 37, 0, 133, 0, 229, 0, 69, 1, 165, 1, 69, 0, 165, 0, 5, 1, 101, 1, 197, 1, 13, 0, 109, 0, 205, 0, 45, 1, 141, 1, 45, 0, 141, 0, 237, 0, 77, 1, 173, 1, 77, 0, 173, 0, 13, 1, 109, 1, 205, 1, 21, 0, 117, 0, 213, 0, 53, 1, 149, 1, 53, 0, 149, 0, 245, 0, 85, 1, 181, 1, 85, 0, 181, 0, 21, 1, 117, 1, 213, 1, 29, 0, 125, 0, 221, 0, 61, 1, 157, 1, 61, 0, 157, 0, 253, 0, 93, 1, 189, 1, 93, 0, 189, 0, 29, 1, 125, 1, 221, 1, 2, 0, 98, 0, 194, 0, 34, 1, 130, 1, 34, 0, 130, 0, 226, 0, 66, 1, 162, 1, 66, 0, 162, 0, 2, 1, 98, 1, 194, 1, 10, 0, 106, 0, 202, 0, 42, 1, 138, 1, 42, 0, 138, 0, 234, 0, 74, 1, 170, 1, 74, 0, 170, 0, 10, 1, 106, 1, 202, 1, 18, 0, 114, 0, 210, 0, 50, 1, 146, 1, 50, 0, 146, 0, 242, 0, 82, 1, 178, 1, 82, 0, 178, 0, 18, 1, 114, 1, 210, 1, 26, 0, 122, 0, 218, 0, 58, 1, 154, 1, 58, 0, 154, 0, 250, 0, 90, 1, 186, 1, 90, 0, 186, 0, 26, 1, 122, 1, 218, 1, 6, 0, 102, 0, 198, 0, 38, 1, 134, 1, 38, 0, 134, 0, 230, 0, 70, 1, 166, 1, 70, 0, 166, 0, 6, 1, 102, 1, 198, 1, 14, 0, 110, 0, 206, 0, 46, 1, 142, 1, 46, 0, 142, 0, 238, 0, 78, 1, 174, 1, 78, 0, 174, 0, 14, 1, 110, 1, 206, 1, 22, 0, 118, 0, 214, 0, 54, 1, 150, 1, 54, 0, 150, 0, 246, 0, 86, 1, 182, 1, 86, 0, 182, 0, 22, 1, 118, 1, 214, 1, 30, 0, 126, 0, 222, 0, 62, 1, 158, 1, 62, 0, 158, 0, 254, 0, 94, 1, 190, 1, 94, 0, 190, 0, 30, 1, 126, 1, 222, 1, 3, 0, 99, 0, 195, 0, 35, 1, 131, 1, 35, 0, 131, 0, 227, 0, 67, 1, 163, 1, 67, 0, 163, 0, 3, 1, 99, 1, 195, 1, 11, 0, 107, 0, 203, 0, 43, 1, 139, 1, 43, 0, 139, 0, 235, 0, 75, 1, 171, 1, 75, 0, 171, 0, 11, 1, 107, 1, 203, 1, 19, 0, 115, 0, 211, 0, 51, 1, 147, 1, 51, 0, 147, 0, 243, 0, 83, 1, 179, 1, 83, 0, 179, 0, 19, 1, 115, 1, 211, 1, 27, 0, 123, 0, 219, 0, 59, 1, 155, 1, 59, 0, 155, 0, 251, 0, 91, 1, 187, 1, 91, 0, 187, 0, 27, 1, 123, 1, 219, 1, 7, 0, 103, 0, 199, 0, 39, 1, 135, 1, 39, 0, 135, 0, 231, 0, 71, 1, 167, 1, 71, 0, 167, 0, 7, 1, 103, 1, 199, 1, 15, 0, 111, 0, 207, 0, 47, 1, 143, 1, 47, 0, 143, 0, 239, 0, 79, 1, 175, 1, 79, 0, 175, 0, 15, 1, 111, 1, 207, 1, 23, 0, 119, 0, 215, 0, 55, 1, 151, 1, 55, 0, 151, 0, 247, 0, 87, 1, 183, 1, 87, 0, 183, 0, 23, 1, 119, 1, 215, 1, 31, 0, 127, 0, 223, 0, 63, 1, 159, 1, 63, 0, 159, 0, 255, 0, 95, 1, 191, 1, 95, 0, 191, 0, 31, 1, 127, 1, 223, 1, 184, 126, 154, 121, 154, 121, 102, 102, 184, 126, 51, 115, 250, 0, 3, 0, 6, 0, 3, 0, 3, 0, 3, 0, 4, 0, 3, 0, 3, 0, 3, 0, 205, 1, 100, 0, 3, 0, 40, 0, 3, 0, 3, 0, 3, 0, 5, 0, 14, 0, 14, 0, 10, 0, 11, 0, 3, 0, 8, 0, 9, 0, 7, 0, 3, 0, 91, 1, 92, 202, 190, 216, 182, 223, 154, 226, 156, 230, 120, 236, 122, 244, 204, 252, 52, 3, 134, 11, 136, 19, 100, 25, 102, 29, 74, 32, 66, 39, 164, 53, 100, 0, 240, 0, 32, 0, 100, 0, 205, 60, 0, 48, 0, 32, 0, 32, 254, 31, 246, 31, 234, 31, 216, 31, 194, 31, 168, 31, 136, 31, 98, 31, 58, 31, 10, 31, 216, 30, 160, 30, 98, 30, 34, 30, 220, 29, 144, 29, 66, 29, 238, 28, 150, 28, 58, 28, 216, 27, 114, 27, 10, 27, 156, 26, 42, 26, 180, 25, 58, 25, 188, 24, 60, 24, 182, 23, 46, 23, 160, 22, 16, 22, 126, 21, 232, 20, 78, 20, 176, 19, 16, 19, 110, 18, 200, 17, 30, 17, 116, 16, 198, 15, 22, 15, 100, 14, 174, 13, 248, 12, 64, 12, 132, 11, 200, 10, 10, 10, 74, 9, 138, 8, 198, 7, 2, 7, 62, 6, 120, 5, 178, 4, 234, 3, 34, 3, 90, 2, 146, 1, 202, 0, 0, 0, 54, 255, 110, 254, 166, 253, 222, 252, 22, 252, 78, 251, 136, 250, 194, 249, 254, 248, 58, 248, 118, 247, 182, 246, 246, 245, 56, 245, 124, 244, 192, 243, 8, 243, 82, 242, 156, 241, 234, 240, 58, 240, 140, 239, 226, 238, 56, 238, 146, 237, 240, 236, 80, 236, 178, 235, 24, 235, 130, 234, 240, 233, 96, 233, 210, 232, 74, 232, 196, 231, 68, 231, 198, 230, 76, 230, 214, 229, 100, 229, 246, 228, 142, 228, 40, 228, 198, 227, 106, 227, 18, 227, 190, 226, 112, 226, 36, 226, 222, 225, 158, 225, 96, 225, 40, 225, 246, 224, 198, 224, 158, 224, 120, 224, 88, 224, 62, 224, 40, 224, 22, 224, 10, 224, 2, 224, 0, 224, 42, 175, 213, 201, 207, 255, 64, 0, 17, 0, 99, 255, 97, 1, 16, 254, 163, 0, 39, 43, 189, 86, 217, 255, 6, 0, 91, 0, 86, 255, 186, 0, 23, 0, 128, 252, 192, 24, 216, 77, 237, 255, 220, 255, 102, 0, 167, 255, 232, 255, 72, 1, 73, 252, 8, 10, 37, 62, 135, 199, 61, 201, 64, 0, 128, 0, 134, 255, 36, 0, 54, 1, 0, 253, 72, 2, 51, 36, 69, 69, 12, 0, 128, 0, 18, 0, 114, 255, 32, 1, 139, 255, 159, 252, 27, 16, 123, 56, 104, 2, 13, 200, 246, 255, 39, 0, 58, 0, 210, 255, 172, 255, 120, 0, 184, 0, 197, 254, 227, 253, 4, 5, 4, 21, 64, 35, 230, 62, 198, 196, 243, 255, 0, 0, 20, 0, 26, 0, 5, 0, 225, 255, 213, 255, 252, 255, 65, 0, 90, 0, 7, 0, 99, 255, 8, 255, 212, 255, 81, 2, 47, 6, 52, 10, 199, 12, 228, 87, 5, 197, 3, 0, 242, 255, 236, 255, 241, 255, 2, 0, 25, 0, 37, 0, 25, 0, 240, 255, 185, 255, 149, 255, 177, 255, 50, 0, 36, 1, 111, 2, 214, 3, 8, 5, 184, 5, 148, 107, 103, 196, 17, 0, 12, 0, 8, 0, 1, 0, 246, 255, 234, 255, 226, 255, 224, 255, 234, 255, 3, 0, 44, 0, 100, 0, 168, 0, 243, 0, 61, 1, 125, 1, 173, 1, 199, 1, 189, 0, 168, 253, 105, 2, 103, 119, 117, 0, 97, 255, 210, 251, 8, 116, 52, 0, 221, 0, 168, 246, 116, 110, 252, 255, 17, 2, 234, 242, 229, 102, 208, 255, 246, 2, 140, 240, 165, 93, 176, 255, 137, 3, 117, 239, 6, 83, 157, 255, 204, 3, 130, 239, 102, 71, 149, 255, 199, 3, 139, 240, 39, 59, 153, 255, 128, 3, 97, 242, 174, 46, 165, 255, 5, 3, 207, 244, 94, 34, 185, 255, 99, 2, 161, 247, 152, 22, 210, 255, 169, 1, 161, 250, 180, 11, 0, 1, 1, 1, 2, 3, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 0, 3, 12, 15, 48, 51, 60, 63, 192, 195, 204, 207, 240, 243, 252, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 254, 1, 0, 1, 255, 0, 254, 0, 253, 2, 0, 1, 255, 0, 254, 0, 253, 3, 0, 1, 255, 2, 1, 0, 25, 23, 2, 0, 126, 124, 119, 109, 87, 41, 19, 9, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90, 80, 75, 69, 63, 56, 49, 40, 34, 29, 20, 18, 10, 0, 0, 0, 0, 0, 0, 0, 0, 110, 100, 90, 84, 78, 71, 65, 58, 51, 45, 39, 32, 26, 20, 12, 0, 0, 0, 0, 0, 0, 118, 110, 103, 93, 86, 80, 75, 70, 65, 59, 53, 47, 40, 31, 23, 15, 4, 0, 0, 0, 0, 126, 119, 112, 104, 95, 89, 83, 78, 72, 66, 60, 54, 47, 39, 32, 25, 17, 12, 1, 0, 0, 134, 127, 120, 114, 103, 97, 91, 85, 78, 72, 66, 60, 54, 47, 41, 35, 29, 23, 16, 10, 1, 144, 137, 130, 124, 113, 107, 101, 95, 88, 82, 76, 70, 64, 57, 51, 45, 39, 33, 26, 15, 1, 152, 145, 138, 132, 123, 117, 111, 105, 98, 92, 86, 80, 74, 67, 61, 55, 49, 43, 36, 20, 1, 162, 155, 148, 142, 133, 127, 121, 115, 108, 102, 96, 90, 84, 77, 71, 65, 59, 53, 46, 30, 1, 172, 165, 158, 152, 143, 137, 131, 125, 118, 112, 106, 100, 94, 87, 81, 75, 69, 63, 56, 45, 20, 200, 200, 200, 200, 200, 200, 200, 200, 198, 193, 188, 183, 178, 173, 168, 163, 158, 153, 148, 129, 104, 40, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 40, 15, 23, 28, 31, 34, 36, 38, 39, 41, 42, 43, 44, 45, 46, 47, 47, 49, 50, 51, 52, 53, 54, 55, 55, 57, 58, 59, 60, 61, 62, 63, 63, 65, 66, 67, 68, 69, 70, 71, 71, 40, 20, 33, 41, 48, 53, 57, 61, 64, 66, 69, 71, 73, 75, 76, 78, 80, 82, 85, 87, 89, 91, 92, 94, 96, 98, 101, 103, 105, 107, 108, 110, 112, 114, 117, 119, 121, 123, 124, 126, 128, 40, 23, 39, 51, 60, 67, 73, 79, 83, 87, 91, 94, 97, 100, 102, 105, 107, 111, 115, 118, 121, 124, 126, 129, 131, 135, 139, 142, 145, 148, 150, 153, 155, 159, 163, 166, 169, 172, 174, 177, 179, 35, 28, 49, 65, 78, 89, 99, 107, 114, 120, 126, 132, 136, 141, 145, 149, 153, 159, 165, 171, 176, 180, 185, 189, 192, 199, 205, 211, 216, 220, 225, 229, 232, 239, 245, 251, 21, 33, 58, 79, 97, 112, 125, 137, 148, 157, 166, 174, 182, 189, 195, 201, 207, 217, 227, 235, 243, 251, 17, 35, 63, 86, 106, 123, 139, 152, 165, 177, 187, 197, 206, 214, 222, 230, 237, 250, 25, 31, 55, 75, 91, 105, 117, 128, 138, 146, 154, 161, 168, 174, 180, 185, 190, 200, 208, 215, 222, 229, 235, 240, 245, 255, 16, 36, 65, 89, 110, 128, 144, 159, 173, 185, 196, 207, 217, 226, 234, 242, 250, 11, 41, 74, 103, 128, 151, 172, 191, 209, 225, 241, 255, 9, 43, 79, 110, 138, 163, 186, 207, 227, 246, 12, 39, 71, 99, 123, 144, 164, 182, 198, 214, 228, 241, 253, 9, 44, 81, 113, 142, 168, 192, 214, 235, 255, 7, 49, 90, 127, 160, 191, 220, 247, 6, 51, 95, 134, 170, 203, 234, 7, 47, 87, 123, 155, 184, 212, 237, 6, 52, 97, 137, 174, 208, 240, 5, 57, 106, 151, 192, 231, 5, 59, 111, 158, 202, 243, 5, 55, 103, 147, 187, 224, 5, 60, 113, 161, 206, 248, 4, 65, 122, 175, 224, 4, 67, 127, 182, 234, 224, 224, 224, 224, 224, 224, 224, 224, 160, 160, 160, 160, 185, 185, 185, 178, 178, 168, 134, 61, 37, 224, 224, 224, 224, 224, 224, 224, 224, 240, 240, 240, 240, 207, 207, 207, 198, 198, 183, 144, 66, 40, 160, 160, 160, 160, 160, 160, 160, 160, 185, 185, 185, 185, 193, 193, 193, 183, 183, 172, 138, 64, 38, 240, 240, 240, 240, 240, 240, 240, 240, 207, 207, 207, 207, 204, 204, 204, 193, 193, 180, 143, 66, 40, 185, 185, 185, 185, 185, 185, 185, 185, 193, 193, 193, 193, 193, 193, 193, 183, 183, 172, 138, 65, 39, 207, 207, 207, 207, 207, 207, 207, 207, 204, 204, 204, 204, 201, 201, 201, 188, 188, 176, 141, 66, 40, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 194, 194, 194, 184, 184, 173, 139, 65, 39, 204, 204, 204, 204, 204, 204, 204, 204, 201, 201, 201, 201, 198, 198, 198, 187, 187, 175, 140, 66, 40, 72, 127, 65, 129, 66, 128, 65, 128, 64, 128, 62, 128, 64, 128, 64, 128, 92, 78, 92, 79, 92, 78, 90, 79, 116, 41, 115, 40, 114, 40, 132, 26, 132, 26, 145, 17, 161, 12, 176, 10, 177, 11, 24, 179, 48, 138, 54, 135, 54, 132, 53, 134, 56, 133, 55, 132, 55, 132, 61, 114, 70, 96, 74, 88, 75, 88, 87, 74, 89, 66, 91, 67, 100, 59, 108, 50, 120, 40, 122, 37, 97, 43, 78, 50, 83, 78, 84, 81, 88, 75, 86, 74, 87, 71, 90, 73, 93, 74, 93, 74, 109, 40, 114, 36, 117, 34, 117, 34, 143, 17, 145, 18, 146, 19, 162, 12, 165, 10, 178, 7, 189, 6, 190, 8, 177, 9, 23, 178, 54, 115, 63, 102, 66, 98, 69, 99, 74, 89, 71, 91, 73, 91, 78, 89, 86, 80, 92, 66, 93, 64, 102, 59, 103, 60, 104, 60, 117, 52, 123, 44, 138, 35, 133, 31, 97, 38, 77, 45, 61, 90, 93, 60, 105, 42, 107, 41, 110, 45, 116, 38, 113, 38, 112, 38, 124, 26, 132, 27, 136, 19, 140, 20, 155, 14, 159, 16, 158, 18, 170, 13, 177, 10, 187, 8, 192, 6, 175, 9, 159, 10, 21, 178, 59, 110, 71, 86, 75, 85, 84, 83, 91, 66, 88, 73, 87, 72, 92, 75, 98, 72, 105, 58, 107, 54, 115, 52, 114, 55, 112, 56, 129, 51, 132, 40, 150, 33, 140, 29, 98, 35, 77, 42, 42, 121, 96, 66, 108, 43, 111, 40, 117, 44, 123, 32, 120, 36, 119, 33, 127, 33, 134, 34, 139, 21, 147, 23, 152, 20, 158, 25, 154, 26, 166, 21, 173, 16, 184, 13, 184, 10, 150, 13, 139, 15, 22, 178, 63, 114, 74, 82, 84, 83, 92, 82, 103, 62, 96, 72, 96, 67, 101, 73, 107, 72, 113, 55, 118, 52, 125, 52, 118, 52, 117, 55, 135, 49, 137, 39, 157, 32, 145, 29, 97, 33, 77, 40, 2, 1, 0, 0, 8, 13, 16, 19, 21, 23, 24, 26, 27, 28, 29, 30, 31, 32, 32, 33, 34, 34, 35, 36, 36, 37, 37, 224, 112, 44, 15, 3, 2, 1, 0, 254, 237, 192, 132, 70, 23, 4, 0, 255, 252, 226, 155, 61, 11, 2, 0, 250, 245, 234, 203, 71, 50, 42, 38, 35, 33, 31, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 179, 99, 0, 71, 56, 43, 30, 21, 12, 6, 0, 199, 165, 144, 124, 109, 96, 84, 71, 61, 51, 42, 32, 23, 15, 8, 0, 241, 225, 211, 199, 187, 175, 164, 153, 142, 132, 123, 114, 105, 96, 88, 80, 72, 64, 57, 50, 44, 38, 33, 29, 24, 20, 16, 12, 9, 5, 2, 0, 4, 6, 24, 7, 5, 0, 0, 2, 0, 0, 12, 28, 41, 13, 252, 247, 15, 42, 25, 14, 1, 254, 62, 41, 247, 246, 37, 65, 252, 3, 250, 4, 66, 7, 248, 16, 14, 38, 253, 33, 13, 22, 39, 23, 12, 255, 36, 64, 27, 250, 249, 10, 55, 43, 17, 1, 1, 8, 1, 1, 6, 245, 74, 53, 247, 244, 55, 76, 244, 8, 253, 3, 93, 27, 252, 26, 39, 59, 3, 248, 2, 0, 77, 11, 9, 248, 22, 44, 250, 7, 40, 9, 26, 3, 9, 249, 20, 101, 249, 4, 3, 248, 42, 26, 0, 241, 33, 68, 2, 23, 254, 55, 46, 254, 15, 3, 255, 21, 16, 41, 250, 27, 61, 39, 5, 245, 42, 88, 4, 1, 254, 60, 65, 6, 252, 255, 251, 73, 56, 1, 247, 19, 94, 29, 247, 0, 12, 99, 6, 4, 8, 237, 102, 46, 243, 3, 2, 13, 3, 2, 9, 235, 84, 72, 238, 245, 46, 104, 234, 8, 18, 38, 48, 23, 0, 240, 70, 83, 235, 11, 5, 245, 117, 22, 248, 250, 23, 117, 244, 3, 3, 248, 95, 28, 4, 246, 15, 77, 60, 241, 255, 4, 124, 2, 252, 3, 38, 84, 24, 231, 2, 13, 42, 13, 31, 21, 252, 56, 46, 255, 255, 35, 79, 243, 19, 249, 65, 88, 247, 242, 20, 4, 81, 49, 227, 20, 0, 75, 3, 239, 5, 247, 44, 92, 248, 1, 253, 22, 69, 31, 250, 95, 41, 244, 5, 39, 67, 16, 252, 1, 0, 250, 120, 55, 220, 243, 44, 122, 4, 232, 81, 5, 11, 3, 7, 2, 0, 9, 10, 88, 12, 35, 60, 83, 108, 132, 157, 180, 206, 228, 15, 32, 55, 77, 101, 125, 151, 175, 201, 225, 19, 42, 66, 89, 114, 137, 162, 184, 209, 230, 12, 25, 50, 72, 97, 120, 147, 172, 200, 223, 26, 44, 69, 90, 114, 135, 159, 180, 205, 225, 13, 22, 53, 80, 106, 130, 156, 180, 205, 228, 15, 25, 44, 64, 90, 115, 142, 168, 196, 222, 19, 24, 62, 82, 100, 120, 145, 168, 190, 214, 22, 31, 50, 79, 103, 120, 151, 170, 203, 227, 21, 29, 45, 65, 106, 124, 150, 171, 196, 224, 30, 49, 75, 97, 121, 142, 165, 186, 209, 229, 19, 25, 52, 70, 93, 116, 143, 166, 192, 219, 26, 34, 62, 75, 97, 118, 145, 167, 194, 217, 25, 33, 56, 70, 91, 113, 143, 165, 196, 223, 21, 34, 51, 72, 97, 117, 145, 171, 196, 222, 20, 29, 50, 67, 90, 117, 144, 168, 197, 221, 22, 31, 48, 66, 95, 117, 146, 168, 196, 222, 24, 33, 51, 77, 116, 134, 158, 180, 200, 224, 21, 28, 70, 87, 106, 124, 149, 170, 194, 217, 26, 33, 53, 64, 83, 117, 152, 173, 204, 225, 27, 34, 65, 95, 108, 129, 155, 174, 210, 225, 20, 26, 72, 99, 113, 131, 154, 176, 200, 219, 34, 43, 61, 78, 93, 114, 155, 177, 205, 229, 23, 29, 54, 97, 124, 138, 163, 179, 209, 229, 30, 38, 56, 89, 118, 129, 158, 178, 200, 231, 21, 29, 49, 63, 85, 111, 142, 163, 193, 222, 27, 48, 77, 103, 133, 158, 179, 196, 215, 232, 29, 47, 74, 99, 124, 151, 176, 198, 220, 237, 33, 42, 61, 76, 93, 121, 155, 174, 207, 225, 29, 53, 87, 112, 136, 154, 170, 188, 208, 227, 24, 30, 52, 84, 131, 150, 166, 186, 203, 229, 37, 48, 64, 84, 104, 118, 156, 177, 201, 230, 212, 178, 148, 129, 108, 96, 85, 82, 79, 77, 61, 59, 57, 56, 51, 49, 48, 45, 42, 41, 40, 38, 36, 34, 31, 30, 21, 12, 10, 3, 1, 0, 255, 245, 244, 236, 233, 225, 217, 203, 190, 176, 175, 161, 149, 136, 125, 114, 102, 91, 81, 71, 60, 52, 43, 35, 28, 20, 19, 18, 12, 11, 5, 0, 179, 138, 140, 148, 151, 149, 153, 151, 163, 116, 67, 82, 59, 92, 72, 100, 89, 92, 16, 0, 0, 0, 0, 99, 66, 36, 36, 34, 36, 34, 34, 34, 34, 83, 69, 36, 52, 34, 116, 102, 70, 68, 68, 176, 102, 68, 68, 34, 65, 85, 68, 84, 36, 116, 141, 152, 139, 170, 132, 187, 184, 216, 137, 132, 249, 168, 185, 139, 104, 102, 100, 68, 68, 178, 218, 185, 185, 170, 244, 216, 187, 187, 170, 244, 187, 187, 219, 138, 103, 155, 184, 185, 137, 116, 183, 155, 152, 136, 132, 217, 184, 184, 170, 164, 217, 171, 155, 139, 244, 169, 184, 185, 170, 164, 216, 223, 218, 138, 214, 143, 188, 218, 168, 244, 141, 136, 155, 170, 168, 138, 220, 219, 139, 164, 219, 202, 216, 137, 168, 186, 246, 185, 139, 116, 185, 219, 185, 138, 100, 100, 134, 100, 102, 34, 68, 68, 100, 68, 168, 203, 221, 218, 168, 167, 154, 136, 104, 70, 164, 246, 171, 137, 139, 137, 155, 218, 219, 139, 255, 254, 253, 238, 14, 3, 2, 1, 0, 255, 254, 252, 218, 35, 3, 2, 1, 0, 255, 254, 250, 208, 59, 4, 2, 1, 0, 255, 254, 246, 194, 71, 10, 2, 1, 0, 255, 252, 236, 183, 82, 8, 2, 1, 0, 255, 252, 235, 180, 90, 17, 2, 1, 0, 255, 248, 224, 171, 97, 30, 4, 1, 0, 255, 254, 236, 173, 95, 37, 7, 1, 0, 255, 255, 255, 131, 6, 145, 255, 255, 255, 255, 255, 236, 93, 15, 96, 255, 255, 255, 255, 255, 194, 83, 25, 71, 221, 255, 255, 255, 255, 162, 73, 34, 66, 162, 255, 255, 255, 210, 126, 73, 43, 57, 173, 255, 255, 255, 201, 125, 71, 48, 58, 130, 255, 255, 255, 166, 110, 73, 57, 62, 104, 210, 255, 255, 251, 123, 65, 55, 68, 100, 171, 255, 7, 23, 38, 54, 69, 85, 100, 116, 131, 147, 162, 178, 193, 208, 223, 239, 13, 25, 41, 55, 69, 83, 98, 112, 127, 142, 157, 171, 187, 203, 220, 236, 15, 21, 34, 51, 61, 78, 92, 106, 126, 136, 152, 167, 185, 205, 225, 240, 10, 21, 36, 50, 63, 79, 95, 110, 126, 141, 157, 173, 189, 205, 221, 237, 17, 20, 37, 51, 59, 78, 89, 107, 123, 134, 150, 164, 184, 205, 224, 240, 10, 15, 32, 51, 67, 81, 96, 112, 129, 142, 158, 173, 189, 204, 220, 236, 8, 21, 37, 51, 65, 79, 98, 113, 126, 138, 155, 168, 179, 192, 209, 218, 12, 15, 34, 55, 63, 78, 87, 108, 118, 131, 148, 167, 185, 203, 219, 236, 16, 19, 32, 36, 56, 79, 91, 108, 118, 136, 154, 171, 186, 204, 220, 237, 11, 28, 43, 58, 74, 89, 105, 120, 135, 150, 165, 180, 196, 211, 226, 241, 6, 16, 33, 46, 60, 75, 92, 107, 123, 137, 156, 169, 185, 199, 214, 225, 11, 19, 30, 44, 57, 74, 89, 105, 121, 135, 152, 169, 186, 202, 218, 234, 12, 19, 29, 46, 57, 71, 88, 100, 120, 132, 148, 165, 182, 199, 216, 233, 17, 23, 35, 46, 56, 77, 92, 106, 123, 134, 152, 167, 185, 204, 222, 237, 14, 17, 45, 53, 63, 75, 89, 107, 115, 132, 151, 171, 188, 206, 221, 240, 9, 16, 29, 40, 56, 71, 88, 103, 119, 137, 154, 171, 189, 205, 222, 237, 16, 19, 36, 48, 57, 76, 87, 105, 118, 132, 150, 167, 185, 202, 218, 236, 12, 17, 29, 54, 71, 81, 94, 104, 126, 136, 149, 164, 182, 201, 221, 237, 15, 28, 47, 62, 79, 97, 115, 129, 142, 155, 168, 180, 194, 208, 223, 238, 8, 14, 30, 45, 62, 78, 94, 111, 127, 143, 159, 175, 192, 207, 223, 239, 17, 30, 49, 62, 79, 92, 107, 119, 132, 145, 160, 174, 190, 204, 220, 235, 14, 19, 36, 45, 61, 76, 91, 108, 121, 138, 154, 172, 189, 205, 222, 238, 12, 18, 31, 45, 60, 76, 91, 107, 123, 138, 154, 171, 187, 204, 221, 236, 13, 17, 31, 43, 53, 70, 83, 103, 114, 131, 149, 167, 185, 203, 220, 237, 17, 22, 35, 42, 58, 78, 93, 110, 125, 139, 155, 170, 188, 206, 224, 240, 8, 15, 34, 50, 67, 83, 99, 115, 131, 146, 162, 178, 193, 209, 224, 239, 13, 16, 41, 66, 73, 86, 95, 111, 128, 137, 150, 163, 183, 206, 225, 241, 17, 25, 37, 52, 63, 75, 92, 102, 119, 132, 144, 160, 175, 191, 212, 231, 19, 31, 49, 65, 83, 100, 117, 133, 147, 161, 174, 187, 200, 213, 227, 242, 18, 31, 52, 68, 88, 103, 117, 126, 138, 149, 163, 177, 192, 207, 223, 239, 16, 29, 47, 61, 76, 90, 106, 119, 133, 147, 161, 176, 193, 209, 224, 240, 15, 21, 35, 50, 61, 73, 86, 97, 110, 119, 129, 141, 175, 198, 218, 237, 225, 204, 201, 184, 183, 175, 158, 154, 153, 135, 119, 115, 113, 110, 109, 99, 98, 95, 79, 68, 52, 50, 48, 45, 43, 32, 31, 27, 18, 10, 3, 0, 255, 251, 235, 230, 212, 201, 196, 182, 167, 166, 163, 151, 138, 124, 110, 104, 90, 78, 76, 70, 69, 57, 45, 34, 24, 21, 11, 6, 5, 4, 3, 0, 175, 148, 160, 176, 178, 173, 174, 164, 177, 174, 196, 182, 198, 192, 182, 68, 62, 66, 60, 72, 117, 85, 90, 118, 136, 151, 142, 160, 142, 155, 0, 0, 0, 0, 0, 0, 0, 1, 100, 102, 102, 68, 68, 36, 34, 96, 164, 107, 158, 185, 180, 185, 139, 102, 64, 66, 36, 34, 34, 0, 1, 32, 208, 139, 141, 191, 152, 185, 155, 104, 96, 171, 104, 166, 102, 102, 102, 132, 1, 0, 0, 0, 0, 16, 16, 0, 80, 109, 78, 107, 185, 139, 103, 101, 208, 212, 141, 139, 173, 153, 123, 103, 36, 0, 0, 0, 0, 0, 0, 1, 48, 0, 0, 0, 0, 0, 0, 32, 68, 135, 123, 119, 119, 103, 69, 98, 68, 103, 120, 118, 118, 102, 71, 98, 134, 136, 157, 184, 182, 153, 139, 134, 208, 168, 248, 75, 189, 143, 121, 107, 32, 49, 34, 34, 34, 0, 17, 2, 210, 235, 139, 123, 185, 137, 105, 134, 98, 135, 104, 182, 100, 183, 171, 134, 100, 70, 68, 70, 66, 66, 34, 131, 64, 166, 102, 68, 36, 2, 1, 0, 134, 166, 102, 68, 34, 34, 66, 132, 212, 246, 158, 139, 107, 107, 87, 102, 100, 219, 125, 122, 137, 118, 103, 132, 114, 135, 137, 105, 171, 106, 50, 34, 164, 214, 141, 143, 185, 151, 121, 103, 192, 34, 0, 0, 0, 0, 0, 1, 208, 109, 74, 187, 134, 249, 159, 137, 102, 110, 154, 118, 87, 101, 119, 101, 0, 2, 0, 36, 36, 66, 68, 35, 96, 164, 102, 100, 36, 0, 2, 33, 167, 138, 174, 102, 100, 84, 2, 2, 100, 107, 120, 119, 36, 197, 24, 0, 255, 254, 253, 244, 12, 3, 2, 1, 0, 255, 254, 252, 224, 38, 3, 2, 1, 0, 255, 254, 251, 209, 57, 4, 2, 1, 0, 255, 254, 244, 195, 69, 4, 2, 1, 0, 255, 251, 232, 184, 84, 7, 2, 1, 0, 255, 254, 240, 186, 86, 14, 2, 1, 0, 255, 254, 239, 178, 91, 30, 5, 1, 0, 255, 248, 227, 177, 100, 19, 2, 1, 0, 255, 255, 255, 156, 4, 154, 255, 255, 255, 255, 255, 227, 102, 15, 92, 255, 255, 255, 255, 255, 213, 83, 24, 72, 236, 255, 255, 255, 255, 150, 76, 33, 63, 214, 255, 255, 255, 190, 121, 77, 43, 55, 185, 255, 255, 255, 245, 137, 71, 43, 59, 139, 255, 255, 255, 255, 131, 66, 50, 66, 107, 194, 255, 255, 166, 116, 76, 55, 53, 125, 255, 255, 249, 247, 246, 245, 244, 234, 210, 202, 201, 200, 197, 174, 82, 59, 56, 55, 54, 46, 22, 12, 11, 10, 9, 7, 0, 64, 0, 128, 64, 0, 232, 158, 10, 0, 230, 0, 243, 221, 192, 181, 0, 171, 85, 0, 192, 128, 64, 0, 205, 154, 102, 51, 0, 213, 171, 128, 85, 43, 0, 224, 192, 160, 128, 96, 64, 32, 0, 100, 40, 16, 7, 3, 1, 0, 203, 150, 0, 215, 195, 166, 125, 110, 82, 0, 253, 250, 244, 233, 212, 182, 150, 131, 120, 110, 98, 85, 72, 60, 49, 40, 32, 25, 19, 15, 13, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 210, 208, 206, 203, 199, 193, 183, 168, 142, 104, 74, 52, 37, 27, 20, 14, 10, 6, 4, 2, 0, 223, 201, 183, 167, 152, 138, 124, 111, 98, 88, 79, 70, 62, 56, 50, 44, 39, 35, 31, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1, 0, 188, 176, 155, 138, 119, 97, 67, 43, 26, 10, 0, 165, 119, 80, 61, 47, 35, 27, 20, 14, 9, 4, 0, 113, 63, 0, 125, 51, 26, 18, 15, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 198, 105, 45, 22, 15, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 213, 162, 116, 83, 59, 43, 32, 24, 18, 15, 12, 9, 7, 6, 5, 3, 2, 0, 239, 187, 116, 59, 28, 16, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 250, 229, 188, 135, 86, 51, 30, 19, 13, 10, 8, 6, 5, 4, 3, 2, 1, 0, 249, 235, 213, 185, 156, 128, 103, 83, 66, 53, 42, 33, 26, 21, 17, 13, 10, 0, 254, 249, 235, 206, 164, 118, 77, 46, 27, 16, 10, 7, 5, 4, 3, 2, 1, 0, 255, 253, 249, 239, 220, 191, 156, 119, 85, 57, 37, 23, 15, 10, 6, 4, 2, 0, 255, 253, 251, 246, 237, 223, 203, 179, 152, 124, 98, 75, 55, 40, 29, 21, 15, 0, 255, 254, 253, 247, 220, 162, 106, 67, 42, 28, 18, 12, 9, 6, 4, 3, 2, 0, 241, 190, 178, 132, 87, 74, 41, 14, 0, 223, 193, 157, 140, 106, 57, 39, 18, 0, 128, 0, 214, 42, 0, 235, 128, 21, 0, 244, 184, 72, 11, 0, 248, 214, 128, 42, 7, 0, 248, 225, 170, 80, 25, 5, 0, 251, 236, 198, 126, 54, 18, 3, 0, 250, 238, 211, 159, 82, 35, 15, 5, 0, 250, 231, 203, 168, 128, 88, 53, 25, 6, 0, 252, 238, 216, 185, 148, 108, 71, 40, 18, 4, 0, 253, 243, 225, 199, 166, 128, 90, 57, 31, 13, 3, 0, 254, 246, 233, 212, 183, 147, 109, 73, 44, 23, 10, 2, 0, 255, 250, 240, 223, 198, 166, 128, 90, 58, 33, 16, 6, 1, 0, 255, 251, 244, 231, 210, 181, 146, 110, 75, 46, 25, 12, 5, 1, 0, 255, 253, 248, 238, 221, 196, 164, 128, 92, 60, 35, 18, 8, 3, 1, 0, 255, 253, 249, 242, 229, 208, 180, 146, 110, 76, 48, 27, 14, 7, 3, 1, 0, 129, 0, 207, 50, 0, 236, 129, 20, 0, 245, 185, 72, 10, 0, 249, 213, 129, 42, 6, 0, 250, 226, 169, 87, 27, 4, 0, 251, 233, 194, 130, 62, 20, 4, 0, 250, 236, 207, 160, 99, 47, 17, 3, 0, 255, 240, 217, 182, 131, 81, 41, 11, 1, 0, 255, 254, 233, 201, 159, 107, 61, 20, 2, 1, 0, 255, 249, 233, 206, 170, 128, 86, 50, 23, 7, 1, 0, 255, 250, 238, 217, 186, 148, 108, 70, 39, 18, 6, 1, 0, 255, 252, 243, 226, 200, 166, 128, 90, 56, 30, 13, 4, 1, 0, 255, 252, 245, 231, 209, 180, 146, 110, 76, 47, 25, 11, 4, 1, 0, 255, 253, 248, 237, 219, 194, 163, 128, 93, 62, 37, 19, 8, 3, 1, 0, 255, 254, 250, 241, 226, 205, 177, 145, 111, 79, 51, 30, 15, 6, 2, 1, 0, 129, 0, 203, 54, 0, 234, 129, 23, 0, 245, 184, 73, 10, 0, 250, 215, 129, 41, 5, 0, 252, 232, 173, 86, 24, 3, 0, 253, 240, 200, 129, 56, 15, 2, 0, 253, 244, 217, 164, 94, 38, 10, 1, 0, 253, 245, 226, 189, 132, 71, 27, 7, 1, 0, 253, 246, 231, 203, 159, 105, 56, 23, 6, 1, 0, 255, 248, 235, 213, 179, 133, 85, 47, 19, 5, 1, 0, 255, 254, 243, 221, 194, 159, 117, 70, 37, 12, 2, 1, 0, 255, 254, 248, 234, 208, 171, 128, 85, 48, 22, 8, 2, 1, 0, 255, 254, 250, 240, 220, 189, 149, 107, 67, 36, 16, 6, 2, 1, 0, 255, 254, 251, 243, 227, 201, 166, 128, 90, 55, 29, 13, 5, 2, 1, 0, 255, 254, 252, 246, 234, 213, 183, 147, 109, 73, 43, 22, 10, 4, 2, 1, 0, 130, 0, 200, 58, 0, 231, 130, 26, 0, 244, 184, 76, 12, 0, 249, 214, 130, 43, 6, 0, 252, 232, 173, 87, 24, 3, 0, 253, 241, 203, 131, 56, 14, 2, 0, 254, 246, 221, 167, 94, 35, 8, 1, 0, 254, 249, 232, 193, 130, 65, 23, 5, 1, 0, 255, 251, 239, 211, 162, 99, 45, 15, 4, 1, 0, 255, 251, 243, 223, 186, 131, 74, 33, 11, 3, 1, 0, 255, 252, 245, 230, 202, 158, 105, 57, 24, 8, 2, 1, 0, 255, 253, 247, 235, 214, 179, 132, 84, 44, 19, 7, 2, 1, 0, 255, 254, 250, 240, 223, 196, 159, 112, 69, 36, 15, 6, 2, 1, 0, 255, 254, 253, 245, 231, 209, 176, 136, 93, 55, 27, 11, 3, 2, 1, 0, 255, 254, 253, 252, 239, 221, 194, 158, 117, 76, 42, 18, 4, 3, 2, 1, 0, 0, 0, 2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104, 119, 135, 254, 49, 67, 77, 82, 93, 99, 198, 11, 18, 24, 31, 36, 45, 255, 46, 66, 78, 87, 94, 104, 208, 14, 21, 32, 42, 51, 66, 255, 94, 104, 109, 112, 115, 118, 248, 53, 69, 80, 88, 95, 102, 0, 15, 8, 7, 4, 11, 12, 3, 2, 13, 10, 5, 6, 9, 14, 1, 0, 9, 6, 3, 4, 5, 8, 1, 2, 7, 0, 1, 0, 0, 0, 1, 0, 0, 1, 255, 1, 255, 2, 254, 2, 254, 3, 253, 0, 1, 0, 1, 255, 2, 255, 2, 254, 3, 254, 3, 0, 2, 255, 255, 255, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 255, 2, 1, 0, 1, 1, 0, 0, 255, 255, 0, 0, 1, 255, 0, 1, 255, 0, 255, 1, 254, 2, 254, 254, 2, 253, 2, 3, 253, 252, 3, 252, 4, 4, 251, 5, 250, 251, 6, 249, 6, 5, 8, 247, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 255, 1, 0, 0, 1, 255, 0, 1, 255, 255, 1, 255, 2, 1, 255, 2, 254, 254, 2, 254, 2, 2, 3, 253, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 255, 1, 0, 0, 2, 1, 255, 2, 255, 255, 2, 255, 2, 2, 255, 3, 254, 254, 254, 3, 0, 1, 0, 0, 1, 0, 1, 255, 2, 255, 2, 255, 2, 3, 254, 3, 254, 254, 4, 4, 253, 5, 253, 252, 6, 252, 6, 5, 251, 8, 250, 251, 249, 9, 4, 0, 2, 0, 0, 0, 9, 4, 7, 4, 0, 3, 12, 7, 7, 120, 0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 20480);
var tempDoublePtr = Runtime.alignMemory(allocate(12, "i8", ALLOC_STATIC), 8);
assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) {
	HEAP8[tempDoublePtr] = HEAP8[ptr];
	HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
	HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
	HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3]
}

function copyTempDouble(ptr) {
	HEAP8[tempDoublePtr] = HEAP8[ptr];
	HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
	HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
	HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
	HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
	HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
	HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
	HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7]
}
Module["_bitshift64Ashr"] = _bitshift64Ashr;
var _fabsf = Math_abs;

function ___setErrNo(value) {
	if (Module["___errno_location"]) HEAP32[Module["___errno_location"]() >> 2] = value;
	return value
}
var ERRNO_CODES = {
	EPERM: 1,
	ENOENT: 2,
	ESRCH: 3,
	EINTR: 4,
	EIO: 5,
	ENXIO: 6,
	E2BIG: 7,
	ENOEXEC: 8,
	EBADF: 9,
	ECHILD: 10,
	EAGAIN: 11,
	EWOULDBLOCK: 11,
	ENOMEM: 12,
	EACCES: 13,
	EFAULT: 14,
	ENOTBLK: 15,
	EBUSY: 16,
	EEXIST: 17,
	EXDEV: 18,
	ENODEV: 19,
	ENOTDIR: 20,
	EISDIR: 21,
	EINVAL: 22,
	ENFILE: 23,
	EMFILE: 24,
	ENOTTY: 25,
	ETXTBSY: 26,
	EFBIG: 27,
	ENOSPC: 28,
	ESPIPE: 29,
	EROFS: 30,
	EMLINK: 31,
	EPIPE: 32,
	EDOM: 33,
	ERANGE: 34,
	ENOMSG: 42,
	EIDRM: 43,
	ECHRNG: 44,
	EL2NSYNC: 45,
	EL3HLT: 46,
	EL3RST: 47,
	ELNRNG: 48,
	EUNATCH: 49,
	ENOCSI: 50,
	EL2HLT: 51,
	EDEADLK: 35,
	ENOLCK: 37,
	EBADE: 52,
	EBADR: 53,
	EXFULL: 54,
	ENOANO: 55,
	EBADRQC: 56,
	EBADSLT: 57,
	EDEADLOCK: 35,
	EBFONT: 59,
	ENOSTR: 60,
	ENODATA: 61,
	ETIME: 62,
	ENOSR: 63,
	ENONET: 64,
	ENOPKG: 65,
	EREMOTE: 66,
	ENOLINK: 67,
	EADV: 68,
	ESRMNT: 69,
	ECOMM: 70,
	EPROTO: 71,
	EMULTIHOP: 72,
	EDOTDOT: 73,
	EBADMSG: 74,
	ENOTUNIQ: 76,
	EBADFD: 77,
	EREMCHG: 78,
	ELIBACC: 79,
	ELIBBAD: 80,
	ELIBSCN: 81,
	ELIBMAX: 82,
	ELIBEXEC: 83,
	ENOSYS: 38,
	ENOTEMPTY: 39,
	ENAMETOOLONG: 36,
	ELOOP: 40,
	EOPNOTSUPP: 95,
	EPFNOSUPPORT: 96,
	ECONNRESET: 104,
	ENOBUFS: 105,
	EAFNOSUPPORT: 97,
	EPROTOTYPE: 91,
	ENOTSOCK: 88,
	ENOPROTOOPT: 92,
	ESHUTDOWN: 108,
	ECONNREFUSED: 111,
	EADDRINUSE: 98,
	ECONNABORTED: 103,
	ENETUNREACH: 101,
	ENETDOWN: 100,
	ETIMEDOUT: 110,
	EHOSTDOWN: 112,
	EHOSTUNREACH: 113,
	EINPROGRESS: 115,
	EALREADY: 114,
	EDESTADDRREQ: 89,
	EMSGSIZE: 90,
	EPROTONOSUPPORT: 93,
	ESOCKTNOSUPPORT: 94,
	EADDRNOTAVAIL: 99,
	ENETRESET: 102,
	EISCONN: 106,
	ENOTCONN: 107,
	ETOOMANYREFS: 109,
	EUSERS: 87,
	EDQUOT: 122,
	ESTALE: 116,
	ENOTSUP: 95,
	ENOMEDIUM: 123,
	EILSEQ: 84,
	EOVERFLOW: 75,
	ECANCELED: 125,
	ENOTRECOVERABLE: 131,
	EOWNERDEAD: 130,
	ESTRPIPE: 86
};

function _sysconf(name) {
	switch (name) {
		case 30:
			return PAGE_SIZE;
		case 85:
			return totalMemory / PAGE_SIZE;
		case 132:
		case 133:
		case 12:
		case 137:
		case 138:
		case 15:
		case 235:
		case 16:
		case 17:
		case 18:
		case 19:
		case 20:
		case 149:
		case 13:
		case 10:
		case 236:
		case 153:
		case 9:
		case 21:
		case 22:
		case 159:
		case 154:
		case 14:
		case 77:
		case 78:
		case 139:
		case 80:
		case 81:
		case 82:
		case 68:
		case 67:
		case 164:
		case 11:
		case 29:
		case 47:
		case 48:
		case 95:
		case 52:
		case 51:
		case 46:
			return 200809;
		case 79:
			return 0;
		case 27:
		case 246:
		case 127:
		case 128:
		case 23:
		case 24:
		case 160:
		case 161:
		case 181:
		case 182:
		case 242:
		case 183:
		case 184:
		case 243:
		case 244:
		case 245:
		case 165:
		case 178:
		case 179:
		case 49:
		case 50:
		case 168:
		case 169:
		case 175:
		case 170:
		case 171:
		case 172:
		case 97:
		case 76:
		case 32:
		case 173:
		case 35:
			return -1;
		case 176:
		case 177:
		case 7:
		case 155:
		case 8:
		case 157:
		case 125:
		case 126:
		case 92:
		case 93:
		case 129:
		case 130:
		case 131:
		case 94:
		case 91:
			return 1;
		case 74:
		case 60:
		case 69:
		case 70:
		case 4:
			return 1024;
		case 31:
		case 42:
		case 72:
			return 32;
		case 87:
		case 26:
		case 33:
			return 2147483647;
		case 34:
		case 1:
			return 47839;
		case 38:
		case 36:
			return 99;
		case 43:
		case 37:
			return 2048;
		case 0:
			return 2097152;
		case 3:
			return 65536;
		case 28:
			return 32768;
		case 44:
			return 32767;
		case 75:
			return 16384;
		case 39:
			return 1e3;
		case 89:
			return 700;
		case 71:
			return 256;
		case 40:
			return 255;
		case 2:
			return 100;
		case 180:
			return 64;
		case 25:
			return 20;
		case 5:
			return 16;
		case 6:
			return 6;
		case 73:
			return 4;
		case 84:
			{
				if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1;
				return 1
			}
	}
	___setErrNo(ERRNO_CODES.EINVAL);
	return -1
}
var _llvm_ctlz_i32 = true;
Module["_memset"] = _memset;
Module["_bitshift64Lshr"] = _bitshift64Lshr;
var _floorf = Math_floor;

function _abort() {
	Module["abort"]()
}
var _sqrtf = Math_sqrt;

function _llvm_stackrestore(p) {
	var self = _llvm_stacksave;
	var ret = self.LLVM_SAVEDSTACKS[p];
	self.LLVM_SAVEDSTACKS.splice(p, 1);
	Runtime.stackRestore(ret)
}
var _cos = Math_cos;
Module["_i64Add"] = _i64Add;
var _fabs = Math_abs;
var _floor = Math_floor;

function _llvm_stacksave() {
	var self = _llvm_stacksave;
	if (!self.LLVM_SAVEDSTACKS) {
		self.LLVM_SAVEDSTACKS = []
	}
	self.LLVM_SAVEDSTACKS.push(Runtime.stackSave());
	return self.LLVM_SAVEDSTACKS.length - 1
}
var _sqrt = Math_sqrt;

function _emscripten_memcpy_big(dest, src, num) {
	HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
	return dest
}
Module["_memcpy"] = _memcpy;
var _atan2 = Math_atan2;

function _sbrk(bytes) {
	var self = _sbrk;
	if (!self.called) {
		DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
		self.called = true;
		assert(Runtime.dynamicAlloc);
		self.alloc = Runtime.dynamicAlloc;
		Runtime.dynamicAlloc = (function() {
			abort("cannot dynamically allocate, sbrk now has control")
		})
	}
	var ret = DYNAMICTOP;
	if (bytes != 0) {
		var success = self.alloc(bytes);
		if (!success) return -1 >>> 0
	}
	return ret
}
var _exp = Math_exp;

function _time(ptr) {
	var ret = Date.now() / 1e3 | 0;
	if (ptr) {
		HEAP32[ptr >> 2] = ret
	}
	return ret
}

function _pthread_self() {
	return 0
}
Module["_memmove"] = _memmove;
var _sin = Math_sin;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
staticSealed = true;
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");
var cttz_i8 = allocate([8, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 7, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0], "i8", ALLOC_DYNAMIC);

function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
	try {
		return Module["dynCall_iiiiiii"](index, a1, a2, a3, a4, a5, a6)
	} catch (e) {
		if (typeof e !== "number" && e !== "longjmp") throw e;
		asm["setThrew"](1, 0)
	}
}
Module.asmGlobalArg = {
	"Math": Math,
	"Int8Array": Int8Array,
	"Int16Array": Int16Array,
	"Int32Array": Int32Array,
	"Uint8Array": Uint8Array,
	"Uint16Array": Uint16Array,
	"Uint32Array": Uint32Array,
	"Float32Array": Float32Array,
	"Float64Array": Float64Array,
	"NaN": NaN,
	"Infinity": Infinity
};
Module.asmLibraryArg = {
	"abort": abort,
	"assert": assert,
	"invoke_iiiiiii": invoke_iiiiiii,
	"_fabs": _fabs,
	"_floor": _floor,
	"_sin": _sin,
	"_exp": _exp,
	"_fabsf": _fabsf,
	"_cos": _cos,
	"_pthread_self": _pthread_self,
	"_abort": _abort,
	"___setErrNo": ___setErrNo,
	"_llvm_stacksave": _llvm_stacksave,
	"_sbrk": _sbrk,
	"_time": _time,
	"_atan2": _atan2,
	"_floorf": _floorf,
	"_emscripten_memcpy_big": _emscripten_memcpy_big,
	"_sqrtf": _sqrtf,
	"_sqrt": _sqrt,
	"_llvm_stackrestore": _llvm_stackrestore,
	"_sysconf": _sysconf,
	"STACKTOP": STACKTOP,
	"STACK_MAX": STACK_MAX,
	"tempDoublePtr": tempDoublePtr,
	"ABORT": ABORT,
	"cttz_i8": cttz_i8
}; // EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
	"use asm";
	var a = new global.Int8Array(buffer);
	var b = new global.Int16Array(buffer);
	var c = new global.Int32Array(buffer);
	var d = new global.Uint8Array(buffer);
	var e = new global.Uint16Array(buffer);
	var f = new global.Uint32Array(buffer);
	var g = new global.Float32Array(buffer);
	var h = new global.Float64Array(buffer);
	var i = env.STACKTOP | 0;
	var j = env.STACK_MAX | 0;
	var k = env.tempDoublePtr | 0;
	var l = env.ABORT | 0;
	var m = env.cttz_i8 | 0;
	var n = 0;
	var o = 0;
	var p = 0;
	var q = 0;
	var r = global.NaN,
		s = global.Infinity;
	var t = 0,
		u = 0,
		v = 0,
		w = 0,
		x = 0.0,
		y = 0,
		z = 0,
		A = 0,
		B = 0.0;
	var C = 0;
	var D = 0;
	var E = 0;
	var F = 0;
	var G = 0;
	var H = 0;
	var I = 0;
	var J = 0;
	var K = 0;
	var L = 0;
	var M = global.Math.floor;
	var N = global.Math.abs;
	var O = global.Math.sqrt;
	var P = global.Math.pow;
	var Q = global.Math.cos;
	var R = global.Math.sin;
	var S = global.Math.tan;
	var T = global.Math.acos;
	var U = global.Math.asin;
	var V = global.Math.atan;
	var W = global.Math.atan2;
	var X = global.Math.exp;
	var Y = global.Math.log;
	var Z = global.Math.ceil;
	var _ = global.Math.imul;
	var $ = global.Math.min;
	var aa = global.Math.clz32;
	var ba = env.abort;
	var ca = env.assert;
	var da = env.invoke_iiiiiii;
	var ea = env._fabs;
	var fa = env._floor;
	var ga = env._sin;
	var ha = env._exp;
	var ia = env._fabsf;
	var ja = env._cos;
	var ka = env._pthread_self;
	var la = env._abort;
	var ma = env.___setErrNo;
	var na = env._llvm_stacksave;
	var oa = env._sbrk;
	var pa = env._time;
	var qa = env._atan2;
	var ra = env._floorf;
	var sa = env._emscripten_memcpy_big;
	var ta = env._sqrtf;
	var ua = env._sqrt;
	var va = env._llvm_stackrestore;
	var wa = env._sysconf;
	var xa = 0.0;
	// EMSCRIPTEN_START_FUNCS
	function za(a) {
		a = a | 0;
		var b = 0;
		b = i;
		i = i + a | 0;
		i = i + 15 & -16;
		return b | 0
	}

	function Aa() {
		return i | 0
	}

	function Ba(a) {
		a = a | 0;
		i = a
	}

	function Ca(a, b) {
		a = a | 0;
		b = b | 0;
		i = a;
		j = b
	}

	function Da(a, b) {
		a = a | 0;
		b = b | 0;
		if (!n) {
			n = a;
			o = b
		}
	}

	function Ea(b) {
		b = b | 0;
		a[k >> 0] = a[b >> 0];
		a[k + 1 >> 0] = a[b + 1 >> 0];
		a[k + 2 >> 0] = a[b + 2 >> 0];
		a[k + 3 >> 0] = a[b + 3 >> 0]
	}

	function Fa(b) {
		b = b | 0;
		a[k >> 0] = a[b >> 0];
		a[k + 1 >> 0] = a[b + 1 >> 0];
		a[k + 2 >> 0] = a[b + 2 >> 0];
		a[k + 3 >> 0] = a[b + 3 >> 0];
		a[k + 4 >> 0] = a[b + 4 >> 0];
		a[k + 5 >> 0] = a[b + 5 >> 0];
		a[k + 6 >> 0] = a[b + 6 >> 0];
		a[k + 7 >> 0] = a[b + 7 >> 0]
	}

	function Ga(a) {
		a = a | 0;
		C = a
	}

	function Ha() {
		return C | 0
	}

	function Ia(a, d, e, f, h, i, j, k, l) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		var m = 0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		r = _(c[a + 44 >> 2] | 0, j) | 0;
		q = c[a + 32 >> 2] | 0;
		a = _(b[q + (i << 1) >> 1] | 0, j) | 0;
		if ((k | 0) != 1) {
			p = (r | 0) / (k | 0) | 0;
			a = (a | 0) < (p | 0) ? a : p
		}
		l = (l | 0) == 0;
		p = l ? a : 0;
		o = l ? i : 0;
		h = l ? h : 0;
		l = q + (h << 1) | 0;
		k = b[l >> 1] | 0;
		m = _(k << 16 >> 16, j) | 0;
		i = e;
		a = 0;
		while (1) {
			if ((a | 0) >= (_(k << 16 >> 16, j) | 0)) break;
			g[i >> 2] = 0.0;
			k = b[l >> 1] | 0;
			i = i + 4 | 0;
			a = a + 1 | 0
		}
		d = d + (m << 2) | 0;
		while (1) {
			if ((h | 0) >= (o | 0)) break;
			a = b[q + (h << 1) >> 1] | 0;
			l = _(a << 16 >> 16, j) | 0;
			m = h + 1 | 0;
			s = b[q + (m << 1) >> 1] | 0;
			k = _(s << 16 >> 16, j) | 0;
			n = +X(+((+g[f + (h << 2) >> 2] + +g[18592 + (h << 2) >> 2]) * .6931471805599453));
			s = _(s << 16 >> 16, j) | 0;
			a = _(a << 16 >> 16, j) | 0;
			h = a + 1 | 0;
			a = ((s | 0) > (h | 0) ? s : h) - a | 0;
			h = d;
			while (1) {
				s = i;
				i = s + 4 | 0;
				g[s >> 2] = +g[h >> 2] * n;
				l = l + 1 | 0;
				if ((l | 0) >= (k | 0)) break;
				else h = h + 4 | 0
			}
			h = m;
			d = d + (a << 2) | 0
		}
		qc(e + (p << 2) | 0, 0, r - p << 2 | 0) | 0;
		return
	}

	function Ja(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			h = 0,
			i = 0.0,
			j = 0.0,
			k = 0;
		b = b >> 1;
		d = c << 1;
		e = 0;
		while (1) {
			if ((e | 0) < (c | 0)) f = 0;
			else break;
			while (1) {
				if ((f | 0) >= (b | 0)) break;
				k = a + ((_(d, f) | 0) + e << 2) | 0;
				j = +g[k >> 2] * .7071067690849304;
				h = a + ((_(f << 1 | 1, c) | 0) + e << 2) | 0;
				i = +g[h >> 2] * .7071067690849304;
				g[k >> 2] = j + i;
				g[h >> 2] = j - i;
				f = f + 1 | 0
			}
			e = e + 1 | 0
		}
		return
	}

	function Ka(e, f, h, j, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		u = u | 0;
		v = v | 0;
		w = w | 0;
		x = x | 0;
		y = y | 0;
		z = z | 0;
		var A = 0.0,
			B = 0.0,
			C = 0.0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0.0,
			M = 0,
			N = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			$ = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0,
			ka = 0,
			la = 0,
			ma = 0,
			na = 0,
			oa = 0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ta = 0,
			ua = 0,
			va = 0,
			wa = 0,
			xa = 0,
			ya = 0,
			za = 0,
			Aa = 0,
			Ba = 0,
			Ca = 0,
			Da = 0,
			Ea = 0,
			Fa = 0,
			Ga = 0,
			Ha = 0.0;
		Ga = i;
		i = i + 96 | 0;
		ya = Ga + 84 | 0;
		xa = Ga + 80 | 0;
		za = Ga + 76 | 0;
		Aa = Ga + 72 | 0;
		Fa = Ga + 48 | 0;
		Ea = Ga;
		Da = (l | 0) != 0 ? 2 : 1;
		oa = (o | 0) == 0 ? 1 : 1 << w;
		qa = c[e + 32 >> 2] | 0;
		ra = qa + (f << 1) | 0;
		sa = b[ra >> 1] << w;
		o = e + 8 | 0;
		ua = (_(Da, (b[qa + ((c[o >> 2] | 0) + -1 << 1) >> 1] << w) - sa | 0) | 0) << 2;
		ta = i;
		i = i + ((1 * ua | 0) + 15 & -16) | 0;
		ua = ta;
		o = b[qa + ((c[o >> 2] | 0) + -1 << 1) >> 1] << w;
		pa = o - sa | 0;
		c[Ea + 32 >> 2] = 0;
		va = Ea + 24 | 0;
		c[va >> 2] = v;
		c[Ea >> 2] = 0;
		c[Ea + 12 >> 2] = r;
		c[Ea + 4 >> 2] = e;
		wa = Ea + 36 | 0;
		c[wa >> 2] = c[y >> 2];
		c[Ea + 16 >> 2] = p;
		c[Ea + 40 >> 2] = z;
		ja = Ea + 8 | 0;
		ka = h + -1 | 0;
		la = (l | 0) == 0;
		ma = v + 20 | 0;
		fa = v + 28 | 0;
		ga = Ea + 28 | 0;
		ha = x + -1 | 0;
		ia = Ea + 20 | 0;
		Y = e + 12 | 0;
		Z = (1 << oa) + -1 | 0;
		$ = Fa + 4 | 0;
		ba = Fa + 8 | 0;
		ca = Fa + 12 | 0;
		da = Fa + 16 | 0;
		ea = Fa + 20 | 0;
		W = (p | 0) == 3;
		X = (oa | 0) > 1;
		v = 0;
		o = j + (o << 2) | 0;
		V = f;
		p = 1;
		while (1) {
			if ((V | 0) >= (h | 0)) break;
			c[ja >> 2] = V;
			J = (V | 0) == (ka | 0);
			I = qa + (V << 1) | 0;
			T = b[I >> 1] << w;
			e = j + (T << 2) | 0;
			z = la ? 0 : l + (T << 2) | 0;
			S = V + 1 | 0;
			T = (b[qa + (S << 1) >> 1] << w) - T | 0;
			Q = c[fa >> 2] | 0;
			D = 32 - (aa(Q | 0) | 0) | 0;
			Q = Q >>> (D + -16 | 0);
			U = (Q >>> 12) + -8 | 0;
			U = (c[ma >> 2] << 3) - ((D << 3) + (U + (Q >>> 0 > (c[6720 + (U << 2) >> 2] | 0) >>> 0 & 1))) | 0;
			Q = (V | 0) == (f | 0) ? u : u - U | 0;
			u = t - U | 0;
			c[ga >> 2] = u + -1;
			if ((V | 0) <= (ha | 0) ? (Ba = x - V | 0, Ba = (c[n + (V << 2) >> 2] | 0) + ((Q | 0) / (((Ba | 0) > 3 ? 3 : Ba) | 0) | 0) | 0, Ca = (u | 0) < (Ba | 0), !(((Ca ? u : Ba) | 0) <= 16383 & ((Ca ? u : Ba) | 0) < 0)) : 0) R = ((Ca ? u : Ba) | 0) > 16383 ? 16383 : Ca ? u : Ba;
			else R = 0;
			if (((b[I >> 1] << w) - T | 0) >= (b[ra >> 1] << w | 0)) v = (p | 0) != 0 | (v | 0) == 0 ? V : v;
			D = c[s + (V << 2) >> 2] | 0;
			c[ia >> 2] = D;
			u = (V | 0) < (c[Y >> 2] | 0);
			N = u ? e : ua;
			P = u ? z : la ? z : ua;
			o = J ? 0 : u ? o : 0;
			if ((v | 0) != 0 ? W ^ 1 | X | (D | 0) < 0 : 0) {
				z = (b[qa + (v << 1) >> 1] << w) - sa | 0;
				z = (z | 0) < (T | 0) ? 0 : z - T | 0;
				u = z + sa | 0;
				p = v;
				do p = p + -1 | 0; while ((b[qa + (p << 1) >> 1] << w | 0) > (u | 0));
				u = u + T | 0;
				D = v + -1 | 0;
				do D = D + 1 | 0; while ((b[qa + (D << 1) >> 1] << w | 0) < (u | 0));
				u = 0;
				e = 0;
				do {
					F = _(p, Da) | 0;
					u = u | d[m + F >> 0];
					e = e | d[m + (F + Da + -1) >> 0];
					p = p + 1 | 0
				} while ((p | 0) < (D | 0));
				p = u
			} else {
				z = -1;
				p = Z;
				e = Z
			}
			a: do
				if (!q) na = 25;
				else {
					if ((V | 0) == (r | 0)) {
						u = qa + (r << 1) | 0;
						q = 0;
						while (1) {
							if ((q | 0) >= ((b[u >> 1] << w) - sa | 0)) {
								na = 25;
								break a
							}
							na = ta + (q << 2) | 0;
							g[na >> 2] = (+g[na >> 2] + +g[ta + (pa + q << 2) >> 2]) * .5;
							q = q + 1 | 0
						}
					}
					D = (R | 0) / 2 | 0;
					E = (z | 0) == -1;
					if (J) u = 0;
					else u = ta + ((b[I >> 1] << w) - sa << 2) | 0;
					F = o;
					u = La(Ea, N, T, D, oa, E ? 0 : ta + (z << 2) | 0, w, u, 1.0, F, p) | 0;
					if (J) p = 0;
					else p = ta + (pa + ((b[I >> 1] << w) - sa) << 2) | 0;
					p = La(Ea, P, T, D, oa, E ? 0 : ta + (pa + z << 2) | 0, w, p, 1.0, F, e) | 0
				}
			while (0);
			do
				if ((na | 0) == 25) {
					na = 0;
					G = P;
					if (!P) {
						if (J) u = 0;
						else u = ta + ((b[I >> 1] << w) - sa << 2) | 0;
						u = La(Ea, N, T, R, oa, (z | 0) == -1 ? 0 : ta + (z << 2) | 0, w, u, 1.0, o, p | e) | 0;
						q = 0;
						p = u;
						break
					}
					K = (z | 0) == -1 ? 0 : ta + (z << 2) | 0;
					if (J) J = 0;
					else J = ta + ((b[I >> 1] << w) - sa << 2) | 0;
					H = p | e;
					c[ya >> 2] = N;
					c[xa >> 2] = P;
					c[za >> 2] = R;
					c[Aa >> 2] = H;
					I = (c[Ea >> 2] | 0) == 0;
					E = c[va >> 2] | 0;
					p = N;
					b: do
						if ((T | 0) != 1) {
							Qa(Ea, Fa, p, G, T, za, oa, oa, w, 1, Aa);
							M = c[Fa >> 2] | 0;
							F = c[da >> 2] | 0;
							e = c[ea >> 2] | 0;
							L = +(c[$ >> 2] | 0) * .000030517578125;
							C = +(c[ba >> 2] | 0) * .000030517578125;
							z = (T | 0) == 2;
							c: do
								if (!z) {
									q = c[za >> 2] | 0;
									D = (q - (c[ca >> 2] | 0) | 0) / 2 | 0;
									u = (q | 0) < (D | 0);
									D = ((u ? q : D) | 0) < 0 ? 0 : u ? q : D;
									q = q - D | 0;
									u = (c[ga >> 2] | 0) - e | 0;
									c[ga >> 2] = u;
									if ((D | 0) < (q | 0)) {
										e = c[Aa >> 2] | 0;
										E = La(Ea, G, T, q, oa, 0, w, 0, C, 0, e >> oa) | 0;
										q = q + ((c[ga >> 2] | 0) - u) | 0;
										q = E | (La(Ea, p, T, (q | 0) <= 24 | (F | 0) == 16384 ? D : D + (q + -24) | 0, oa, K, w, J, 1.0, o, e) | 0)
									} else {
										e = c[Aa >> 2] | 0;
										p = La(Ea, p, T, D, oa, K, w, J, 1.0, o, e) | 0;
										D = D + ((c[ga >> 2] | 0) - u) | 0;
										q = p | (La(Ea, G, T, (D | 0) <= 24 | (F | 0) == 0 ? q : q + (D + -24) | 0, oa, 0, w, 0, C, 0, e >> oa) | 0)
									}
									if (!I) {
										u = q;
										break b
									}
									if (!z) {
										z = c[ya >> 2] | 0;
										D = c[xa >> 2] | 0;
										F = D;
										E = z;
										p = 0;
										u = 0;
										e = 0;
										while (1) {
											B = (c[k >> 2] = u, +g[k >> 2]);
											if ((p | 0) >= (T | 0)) break;
											A = +g[F + (p << 2) >> 2];
											u = (g[k >> 2] = B + A * +g[E + (p << 2) >> 2], c[k >> 2] | 0);
											p = p + 1 | 0;
											e = (g[k >> 2] = (c[k >> 2] = e, +g[k >> 2]) + A * A, c[k >> 2] | 0)
										}
										C = L * B;
										B = L * L + (c[k >> 2] = e, +g[k >> 2]);
										A = B - C * 2.0;
										C = B + C * 2.0;
										if (C < 6.000000284984708e-04 | A < 6.000000284984708e-04) {
											tc(D | 0, z | 0, T << 2 | 0) | 0;
											break
										}
										B = 1.0 / +O(+A);
										A = 1.0 / +O(+C);
										u = 0;
										while (1) {
											if ((u | 0) >= (T | 0)) break c;
											p = E + (u << 2) | 0;
											Ha = L * +g[p >> 2];
											D = F + (u << 2) | 0;
											C = +g[D >> 2];
											g[p >> 2] = B * (Ha - C);
											g[D >> 2] = A * (Ha + C);
											u = u + 1 | 0
										}
									}
								} else {
									u = c[za >> 2] | 0;
									d: do
										if ((F | 0) < 16384) {
											switch (F | 0) {
												case 0:
													break;
												default:
													{
														na = 34;
														break d
													}
											}
											c[ga >> 2] = (c[ga >> 2] | 0) - e;
											p = u;
											D = c[xa >> 2] | 0;
											q = 0;
											u = N
										} else {
											switch (F | 0) {
												case 16384:
													break;
												default:
													{
														na = 34;
														break d
													}
											}
											c[ga >> 2] = (c[ga >> 2] | 0) - e;
											p = u;
											D = c[ya >> 2] | 0;
											q = 0;
											u = P
										}
									while (0);
									do
										if ((na | 0) == 34) {
											na = 0;
											q = u - 8 | 0;
											u = (F | 0) > 8192;
											c[ga >> 2] = (c[ga >> 2] | 0) - (e + 8);
											D = u ? c[ya >> 2] | 0 : c[xa >> 2] | 0;
											u = u ? P : N;
											if (I) {
												p = q;
												q = $a(E, 1) | 0;
												break
											} else {
												p = u;
												e = D;
												e = +g[p >> 2] * +g[e + 4 >> 2] - +g[p + 4 >> 2] * +g[e >> 2] < 0.0 & 1;
												cb(E, e, 1);
												p = q;
												q = e;
												break
											}
										}
									while (0);
									e = 1 - (q << 1) | 0;
									q = La(Ea, u, 2, p, oa, K, w, J, 1.0, o, H) | 0;
									g[D >> 2] = +(0 - e | 0) * +g[u + 4 >> 2];
									g[D + 4 >> 2] = +(e | 0) * +g[u >> 2];
									if (!I) {
										u = q;
										break b
									}
									D = c[ya >> 2] | 0;
									g[D >> 2] = L * +g[D >> 2];
									D = (c[ya >> 2] | 0) + 4 | 0;
									g[D >> 2] = L * +g[D >> 2];
									D = c[xa >> 2] | 0;
									g[D >> 2] = C * +g[D >> 2];
									D = (c[xa >> 2] | 0) + 4 | 0;
									g[D >> 2] = C * +g[D >> 2];
									D = c[ya >> 2] | 0;
									A = +g[D >> 2];
									g[D >> 2] = A - +g[c[xa >> 2] >> 2];
									D = c[xa >> 2] | 0;
									g[D >> 2] = A + +g[D >> 2];
									D = (c[ya >> 2] | 0) + 4 | 0;
									A = +g[D >> 2];
									g[D >> 2] = A - +g[(c[xa >> 2] | 0) + 4 >> 2];
									D = (c[xa >> 2] | 0) + 4 | 0;
									g[D >> 2] = A + +g[D >> 2]
								}
							while (0);
							if (!M) u = q;
							else {
								u = 0;
								while (1) {
									if ((u | 0) >= (T | 0)) {
										u = q;
										break b
									}
									D = (c[xa >> 2] | 0) + (u << 2) | 0;
									g[D >> 2] = - +g[D >> 2];
									u = u + 1 | 0
								}
							}
						} else {
							Ma(Ea, p, G, R, J);
							u = 1
						}
					while (0);
					q = 0;
					p = u
				}
			while (0);
			D = _(V, Da) | 0;
			a[m + D >> 0] = u;
			a[m + (D + Da + -1) >> 0] = p;
			u = Q + ((c[n + (V << 2) >> 2] | 0) + U) | 0;
			V = S;
			p = (R | 0) > (T << 3 | 0) & 1
		}
		c[y >> 2] = c[wa >> 2];
		i = Ga;
		return
	}

	function La(a, b, e, f, h, i, j, k, l, m, n) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		j = j | 0;
		k = k | 0;
		l = +l;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0;
		o = i;
		q = m;
		t = (c[a >> 2] | 0) == 0;
		p = c[a + 20 >> 2] | 0;
		u = (h | 0) == 1 & 1;
		s = (e >>> 0) / (h >>> 0) | 0;
		if ((e | 0) == 1) {
			Ma(a, b, 0, f, k);
			j = 1;
			return j | 0
		}
		v = (p | 0) > 0 ? p : 0;
		do
			if ((m | 0) == 0 | (i | 0) == 0) q = o;
			else {
				if ((v | 0) == 0 ? !((s & 1 | 0) == 0 & (p | 0) < 0 | (h | 0) > 1) : 0) {
					q = o;
					break
				}
				tc(m | 0, i | 0, e << 2 | 0) | 0
			}
		while (0);
		r = q;
		i = (q | 0) == 0;
		q = 0;
		while (1) {
			if ((q | 0) >= (v | 0)) break;
			if (!t) Ja(b, e >> q, 1 << q);
			if (!i) Ja(r, e >> q, 1 << q);
			n = d[22474 + (n & 15) >> 0] | 0 | (d[22474 + (n >> 4) >> 0] | 0) << 2;
			q = q + 1 | 0
		}
		q = h >> v;
		m = n;
		n = s << v;
		h = 0;
		while (1) {
			if (!((n & 1 | 0) == 0 & (p | 0) < 0)) break;
			if (!t) Ja(b, n, q);
			if (!i) Ja(r, n, q);
			s = m | m << q;
			q = q << 1;
			m = s;
			n = n >> 1;
			p = p + 1 | 0;
			h = h + 1 | 0
		}
		o = (q | 0) > 1;
		if (o) {
			if (!t) Na(b, n >> v, q << v, u);
			if (!i) Na(r, n >> v, q << v, u)
		}
		p = Oa(a, b, e, f, q, r, j, l, m) | 0;
		if (!t) {
			j = p;
			return j | 0
		}
		if (o) {
			Pa(b, n >> v, q << v, u);
			o = 0
		} else o = 0;
		while (1) {
			if ((o | 0) >= (h | 0)) {
				n = p;
				o = 0;
				break
			}
			j = q >> 1;
			s = n << 1;
			Ja(b, s, j);
			q = j;
			n = s;
			p = p | p >>> j;
			o = o + 1 | 0
		}
		while (1) {
			if ((o | 0) >= (v | 0)) break;
			j = d[22490 + n >> 0] | 0;
			Ja(b, e >> o, 1 << o);
			n = j;
			o = o + 1 | 0
		}
		o = q << v;
		a: do
			if (k) {
				l = +O(+(+(e | 0)));
				p = 0;
				while (1) {
					if ((p | 0) >= (e | 0)) break a;
					g[k + (p << 2) >> 2] = l * +g[b + (p << 2) >> 2];
					p = p + 1 | 0
				}
			}
		while (0);
		j = n & (1 << o) + -1;
		return j | 0
	}

	function Ma(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		l = (c[a >> 2] | 0) == 0;
		m = a + 28 | 0;
		j = c[a + 24 >> 2] | 0;
		k = (d | 0) != 0 ? 2 : 1;
		h = 0;
		i = b;
		while (1) {
			if ((c[m >> 2] | 0) > 7) {
				if (l) a = $a(j, 1) | 0;
				else {
					a = +g[i >> 2] < 0.0 & 1;
					cb(j, a, 1)
				}
				c[m >> 2] = (c[m >> 2] | 0) + -8;
				e = e + -8 | 0
			} else a = 0;
			if (l) g[i >> 2] = (a | 0) != 0 ? -1.0 : 1.0;
			h = h + 1 | 0;
			if ((h | 0) == (k | 0)) break;
			else i = d
		}
		if (!f) return;
		c[f >> 2] = c[b >> 2];
		return
	}

	function Na(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		l = i;
		j = _(b, d) | 0;
		k = i;
		i = i + ((1 * (j << 2) | 0) + 15 & -16) | 0;
		if (!e) {
			f = 0;
			while (1) {
				if ((f | 0) >= (d | 0)) break;
				e = _(f, b) | 0;
				g = 0;
				while (1) {
					if ((g | 0) >= (b | 0)) break;
					c[k + (e + g << 2) >> 2] = c[a + ((_(g, d) | 0) + f << 2) >> 2];
					g = g + 1 | 0
				}
				f = f + 1 | 0
			}
			e = j << 2;
			tc(a | 0, k | 0, e | 0) | 0;
			i = l;
			return
		}
		g = d + -2 | 0;
		e = 0;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			f = 1416 + (g + e << 2) | 0;
			h = 0;
			while (1) {
				if ((h | 0) >= (b | 0)) break;
				m = c[a + ((_(h, d) | 0) + e << 2) >> 2] | 0;
				c[k + ((_(c[f >> 2] | 0, b) | 0) + h << 2) >> 2] = m;
				h = h + 1 | 0
			}
			e = e + 1 | 0
		}
		d = j << 2;
		tc(a | 0, k | 0, d | 0) | 0;
		i = l;
		return
	}

	function Oa(e, f, h, j, k, l, m, n, o) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = +n;
		o = o | 0;
		var p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0.0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0;
		H = i;
		i = i + 32 | 0;
		A = H + 28 | 0;
		G = H + 24 | 0;
		p = H;
		c[A >> 2] = j;
		c[G >> 2] = o;
		E = (c[e >> 2] | 0) == 0;
		D = c[e + 8 >> 2] | 0;
		F = c[e + 16 >> 2] | 0;
		r = c[e + 24 >> 2] | 0;
		C = c[e + 4 >> 2] | 0;
		u = C + 100 | 0;
		z = c[u >> 2] | 0;
		x = m + 1 | 0;
		B = C + 8 | 0;
		y = (_(x, c[B >> 2] | 0) | 0) + D | 0;
		C = C + 96 | 0;
		y = b[(c[C >> 2] | 0) + (y << 1) >> 1] | 0;
		t = a[z + y >> 0] | 0;
		if ((m | 0) != -1 ? ((h | 0) > 2 ? ((d[z + (y + (t & 255)) >> 0] | 0) + 12 | 0) < (j | 0) : 0) : 0) {
			x = h >> 1;
			y = f + (x << 2) | 0;
			z = m + -1 | 0;
			if ((k | 0) == 1) c[G >> 2] = o & 1 | o << 1;
			u = k + 1 >> 1;
			Qa(e, p, f, y, x, A, u, k, z, 0, G);
			s = c[p + 12 >> 2] | 0;
			v = c[p + 16 >> 2] | 0;
			r = c[p + 20 >> 2] | 0;
			w = +(c[p + 4 >> 2] | 0) * .000030517578125;
			q = +(c[p + 8 >> 2] | 0) * .000030517578125;
			do
				if (!((k | 0) <= 1 | (v & 16383 | 0) == 0))
					if ((v | 0) > 8192) {
						s = s - (s >> 5 - m) | 0;
						break
					} else {
						s = s + (x << 3 >> 6 - m) | 0;
						s = (s | 0) > 0 ? 0 : s;
						break
					}
			while (0);
			t = c[A >> 2] | 0;
			p = (t - s | 0) / 2 | 0;
			j = (t | 0) < (p | 0);
			p = ((j ? t : p) | 0) < 0 ? 0 : j ? t : p;
			t = t - p | 0;
			j = e + 28 | 0;
			r = (c[j >> 2] | 0) - r | 0;
			c[j >> 2] = r;
			s = (l | 0) == 0 ? 0 : l + (x << 2) | 0;
			if ((p | 0) < (t | 0)) {
				h = c[G >> 2] | 0;
				F = (Oa(e, y, x, t, u, s, z, q * n, h >> u) | 0) << (k >> 1);
				o = t + ((c[j >> 2] | 0) - r) | 0;
				e = F | (Oa(e, f, x, (o | 0) <= 24 | (v | 0) == 16384 ? p : p + (o + -24) | 0, u, l, z, w * n, h) | 0);
				i = H;
				return e | 0
			} else {
				h = c[G >> 2] | 0;
				F = Oa(e, f, x, p, u, l, z, w * n, h) | 0;
				o = p + ((c[j >> 2] | 0) - r) | 0;
				e = F | (Oa(e, y, x, (o | 0) <= 24 | (v | 0) == 0 ? t : t + (o + -24) | 0, u, s, z, q * n, h >> u) | 0) << (k >> 1);
				i = H;
				return e | 0
			}
		}
		p = j + -1 | 0;
		t = t & 255;
		s = 0;
		j = 0;
		while (1) {
			if ((j | 0) == 6) break;
			A = s + t + 1 >> 1;
			m = (d[z + (y + A) >> 0] | 0) < (p | 0);
			t = m ? t : A;
			s = m ? A : s;
			j = j + 1 | 0
		}
		if (!s) j = -1;
		else j = d[z + (y + s) >> 0] | 0;
		p = (p - j | 0) > ((d[z + (y + t) >> 0] | 0) - p | 0) ? t : s;
		if (!p) j = 0;
		else j = (d[z + (y + p) >> 0] | 0) + 1 | 0;
		v = e + 28 | 0;
		z = j;
		j = (c[v >> 2] | 0) - j | 0;
		while (1) {
			c[v >> 2] = j;
			if (!((j | 0) < 0 & (p | 0) > 0)) break;
			j = j + z | 0;
			c[v >> 2] = j;
			p = p + -1 | 0;
			if (!p) t = 0;
			else t = (d[(c[u >> 2] | 0) + ((b[(c[C >> 2] | 0) + ((_(x, c[B >> 2] | 0) | 0) + D << 1) >> 1] | 0) + p) >> 0] | 0) + 1 | 0;
			z = t;
			j = j - t | 0
		}
		if (p) {
			if ((p | 0) >= 8) p = (p & 7 | 8) << (p >> 3) + -1;
			if (E) {
				e = pb(f, h, p, F, k, r, n) | 0;
				i = H;
				return e | 0
			} else {
				e = ob(f, h, p, F, k, r) | 0;
				i = H;
				return e | 0
			}
		}
		if (!E) {
			e = 0;
			i = H;
			return e | 0
		}
		p = (1 << k) + -1 | 0;
		o = p & o;
		c[G >> 2] = o;
		if (!o) {
			qc(f | 0, 0, h << 2 | 0) | 0;
			e = 0;
			i = H;
			return e | 0
		}
		s = e + 36 | 0;
		a: do
			if (!l) {
				r = 0;
				while (1) {
					if ((r | 0) >= (h | 0)) break a;
					e = (_(c[s >> 2] | 0, 1664525) | 0) + 1013904223 | 0;
					c[s >> 2] = e;
					g[f + (r << 2) >> 2] = +(e >> 20 | 0);
					r = r + 1 | 0
				}
			} else {
				r = 0;
				while (1) {
					if ((r | 0) >= (h | 0)) break;
					e = (_(c[s >> 2] | 0, 1664525) | 0) + 1013904223 | 0;
					c[s >> 2] = e;
					g[f + (r << 2) >> 2] = +g[l + (r << 2) >> 2] + ((e & 32768 | 0) == 0 ? -.00390625 : .00390625);
					r = r + 1 | 0
				}
				p = c[G >> 2] | 0
			}
		while (0);
		r = 0;
		q = 0.0;
		while (1) {
			if ((r | 0) >= (h | 0)) break;
			w = +g[f + (r << 2) >> 2];
			r = r + 1 | 0;
			q = q + w * w
		}
		q = 1.0 / +O(+(q + 1.0000000036274937e-15)) * n;
		r = 0;
		while (1) {
			if ((r | 0) >= (h | 0)) break;
			g[f >> 2] = q * +g[f >> 2];
			r = r + 1 | 0;
			f = f + 4 | 0
		}
		i = H;
		return p | 0
	}

	function Pa(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		l = i;
		j = _(b, d) | 0;
		k = i;
		i = i + ((1 * (j << 2) | 0) + 15 & -16) | 0;
		if (!e) {
			f = 0;
			while (1) {
				if ((f | 0) >= (d | 0)) break;
				e = _(f, b) | 0;
				g = 0;
				while (1) {
					if ((g | 0) >= (b | 0)) break;
					c[k + ((_(g, d) | 0) + f << 2) >> 2] = c[a + (e + g << 2) >> 2];
					g = g + 1 | 0
				}
				f = f + 1 | 0
			}
			e = j << 2;
			tc(a | 0, k | 0, e | 0) | 0;
			i = l;
			return
		}
		g = d + -2 | 0;
		e = 0;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			f = 1416 + (g + e << 2) | 0;
			h = 0;
			while (1) {
				if ((h | 0) >= (b | 0)) break;
				c[k + ((_(h, d) | 0) + e << 2) >> 2] = c[a + ((_(c[f >> 2] | 0, b) | 0) + h << 2) >> 2];
				h = h + 1 | 0
			}
			e = e + 1 | 0
		}
		e = j << 2;
		tc(a | 0, k | 0, e | 0) | 0;
		i = l;
		return
	}

	function Qa(a, e, f, h, i, j, k, l, m, n, o) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0.0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0.0,
			K = 0.0,
			L = 0.0;
		p = c[a >> 2] | 0;
		E = c[a + 8 >> 2] | 0;
		x = c[a + 12 >> 2] | 0;
		v = c[a + 24 >> 2] | 0;
		C = c[a + 32 >> 2] | 0;
		D = c[a + 4 >> 2] | 0;
		m = (b[(c[D + 56 >> 2] | 0) + (E << 1) >> 1] | 0) + (m << 3) | 0;
		r = m >> 1;
		B = (n | 0) == 0;
		if (B) {
			n = r - 4 | 0;
			w = c[j >> 2] | 0;
			r = (i << 1) + -1 | 0
		} else {
			F = i << 1;
			n = r - ((i | 0) == 2 ? 16 : 4) | 0;
			w = c[j >> 2] | 0;
			r = (i | 0) == 2 ? F + -2 | 0 : F + -1 | 0
		}
		F = (w + (_(r, n) | 0) | 0) / (r | 0) | 0;
		m = w - m + -32 | 0;
		m = (m | 0) < (F | 0) ? m : F;
		if ((m | 0) <= 64)
			if ((m | 0) < 4) r = 1;
			else y = 6;
		else {
			m = 64;
			y = 6
		}
		if ((y | 0) == 6) r = (b[19648 + ((m & 7) << 1) >> 1] >> 14 - (m >> 3)) + 1 & -2;
		z = B | (E | 0) < (x | 0) ? r : 1;
		A = (p | 0) == 0;
		if (A) q = 0;
		else {
			a: do
				if (B) {
					r = 0;
					t = 0.0;
					while (1) {
						if ((r | 0) >= (i | 0)) {
							n = 0;
							s = 0.0;
							break
						}
						s = +g[f + (r << 2) >> 2];
						r = r + 1 | 0;
						t = t + s * s
					}
					while (1) {
						if ((n | 0) >= (i | 0)) break;
						J = +g[h + (n << 2) >> 2];
						n = n + 1 | 0;
						s = s + J * J
					}
					t = t + 1.0000000036274937e-15;
					s = s + 1.0000000036274937e-15
				} else {
					t = 1.0000000036274937e-15;
					s = 1.0000000036274937e-15;
					n = 0;
					while (1) {
						if ((n | 0) >= (i | 0)) break a;
						L = +g[f + (n << 2) >> 2];
						J = +g[h + (n << 2) >> 2];
						K = L + J;
						J = L - J;
						t = t + K * K;
						s = s + J * J;
						n = n + 1 | 0
					}
				}while (0);q = ~~+M(+(+W(+(+O(+s)), +(+O(+t))) * 10430.3818359375 + .5))
		}
		u = v;
		G = u + 20 | 0;
		H = c[G >> 2] << 3;
		I = u + 28 | 0;
		x = c[I >> 2] | 0;
		p = 32 - (aa(x | 0) | 0) | 0;
		y = x >>> (p + -16 | 0);
		F = (y >>> 12) + -8 | 0;
		F = (p << 3) + (F + (y >>> 0 > (c[6720 + (F << 2) >> 2] | 0) >>> 0 & 1)) | 0;
		b: do
			if ((z | 0) == 1)
				if (!B) {
					if (A) {
						q = w;
						n = 0
					} else {
						B = (q | 0) > 8192;
						n = B & 1;
						c: do
							if (B) {
								r = 0;
								while (1) {
									if ((r | 0) >= (i | 0)) break c;
									B = h + (r << 2) | 0;
									g[B >> 2] = - +g[B >> 2];
									r = r + 1 | 0
								}
							}
						while (0);
						Ra(D, f, h, C, E, i);
						q = c[j >> 2] | 0
					}
					if ((q | 0) > 16 ? (c[a + 28 >> 2] | 0) > 16 : 0) {
						r = c[I >> 2] | 0;
						m = u + 32 | 0;
						if (!A) {
							p = r >>> 2;
							q = r - p | 0;
							if (!n) p = q;
							else c[m >> 2] = (c[m >> 2] | 0) + q;
							c[I >> 2] = p;
							db(u);
							m = n;
							q = 0;
							break
						}
						q = c[m >> 2] | 0;
						p = r >>> 2;
						h = q >>> 0 < p >>> 0;
						m = h & 1;
						if (!h) {
							c[v + 32 >> 2] = q - p;
							p = r - p | 0
						}
						q = v;
						l = q + 28 | 0;
						c[l >> 2] = p;
						u = q + 20 | 0;
						a = q + 40 | 0;
						v = q + 24 | 0;
						w = q + 4 | 0;
						x = q + 32 | 0;
						while (1) {
							if (p >>> 0 >= 8388609) {
								q = 0;
								break b
							}
							c[u >> 2] = (c[u >> 2] | 0) + 8;
							p = p << 8;
							c[l >> 2] = p;
							n = c[a >> 2] | 0;
							r = c[v >> 2] | 0;
							if (r >>> 0 < (c[w >> 2] | 0) >>> 0) {
								c[v >> 2] = r + 1;
								r = d[(c[q >> 2] | 0) + r >> 0] | 0
							} else r = 0;
							c[a >> 2] = r;
							c[x >> 2] = ((n << 8 | r) >>> 1 & 255 | c[x >> 2] << 8 & 2147483392) ^ 255
						}
					} else {
						m = 0;
						q = 0
					}
				} else m = 0;
		else {
			if (!A) q = (_(q, z) | 0) + 8192 >> 14;
			d: do
				if ((B ^ 1) & (i | 0) > 2) {
					w = (z | 0) / 2 | 0;
					m = (w * 3 | 0) + 3 + w | 0;
					if (!A) {
						if ((q | 0) > (w | 0)) {
							r = q + -1 - w + ((w * 3 | 0) + 3) | 0;
							n = q - w + ((w * 3 | 0) + 3) | 0
						} else {
							r = q * 3 | 0;
							n = (q * 3 | 0) + 3 | 0
						}
						ab(u, r, n, m);
						y = 61;
						break
					}
					p = (x >>> 0) / (m >>> 0) | 0;
					c[u + 36 >> 2] = p;
					r = (((c[u + 32 >> 2] | 0) >>> 0) / (p >>> 0) | 0) + 1 | 0;
					r = m - (m >>> 0 < r >>> 0 ? m : r) | 0;
					y = w + 1 | 0;
					x = y * 3 | 0;
					r = (r | 0) < (x | 0) ? (r | 0) / 3 | 0 : y + (r - x) | 0;
					if ((r | 0) > (w | 0)) {
						q = r - w + x | 0;
						w = r + -1 - w + x | 0
					} else {
						q = (r * 3 | 0) + 3 | 0;
						w = r * 3 | 0
					}
					x = _(p, m - q | 0) | 0;
					y = v + 32 | 0;
					p = (c[y >> 2] | 0) - x | 0;
					c[y >> 2] = p;
					if (!w) {
						w = v + 28 | 0;
						a = w;
						x = (c[w >> 2] | 0) - x | 0
					} else {
						a = v + 28 | 0;
						x = _(c[v + 36 >> 2] | 0, q - w | 0) | 0
					}
					c[a >> 2] = x;
					m = v + 20 | 0;
					n = v + 40 | 0;
					l = v + 24 | 0;
					u = v + 4 | 0;
					q = p;
					while (1) {
						if (x >>> 0 >= 8388609) {
							y = 62;
							break d
						}
						c[m >> 2] = (c[m >> 2] | 0) + 8;
						x = x << 8;
						c[a >> 2] = x;
						w = c[n >> 2] | 0;
						p = c[l >> 2] | 0;
						if (p >>> 0 < (c[u >> 2] | 0) >>> 0) {
							c[l >> 2] = p + 1;
							p = d[(c[v >> 2] | 0) + p >> 0] | 0
						} else p = 0;
						c[n >> 2] = p;
						p = ((w << 8 | p) >>> 1 & 255 | q << 8 & 2147483392) ^ 255;
						c[y >> 2] = p;
						q = p
					}
				} else {
					if ((l | 0) > 1 | B ^ 1) {
						n = z + 1 | 0;
						if (A) {
							m = 0;
							q = ((_a(u, n) | 0) << 14 >>> 0) / (z >>> 0) | 0;
							break b
						} else {
							bb(u, q, n);
							y = 61;
							break
						}
					}
					w = z >> 1;
					m = w + 1 | 0;
					l = _(m, m) | 0;
					if (!A) {
						if ((q | 0) > (w | 0)) {
							n = z + 1 - q | 0;
							r = l - ((_(z + 1 - q | 0, z + 2 - q | 0) | 0) >> 1) | 0
						} else {
							n = q + 1 | 0;
							r = (_(q, q + 1 | 0) | 0) >> 1
						}
						ab(u, r, r + n | 0, l);
						y = 61;
						break
					}
					y = (x >>> 0) / (l >>> 0) | 0;
					c[u + 36 >> 2] = y;
					p = (((c[u + 32 >> 2] | 0) >>> 0) / (y >>> 0) | 0) + 1 | 0;
					p = l >>> 0 < p >>> 0 ? l : p;
					x = l - p | 0;
					if ((x | 0) < ((_(w, m) | 0) >> 1 | 0)) {
						x = x << 3 | 1;
						m = 32 - (aa(x | 0) | 0) + -1 >> 1;
						q = 1 << m;
						r = 0;
						while (1) {
							p = (r << 1) + q << m;
							w = x >>> 0 < p >>> 0;
							r = w ? r : r + q | 0;
							if ((m | 0) <= 0) break;
							else {
								x = w ? x : x - p | 0;
								q = q >>> 1;
								m = m + -1 | 0
							}
						}
						x = (r + -1 | 0) >>> 1;
						p = x + 1 | 0;
						w = p;
						r = x;
						p = (_(x, p) | 0) >>> 1
					} else {
						n = z << 1;
						x = (p << 3) + -7 | 0;
						m = 32 - (aa(x | 0) | 0) + -1 >> 1;
						q = 1 << m;
						r = 0;
						while (1) {
							p = (r << 1) + q << m;
							w = x >>> 0 < p >>> 0;
							r = w ? r : r + q | 0;
							if ((m | 0) <= 0) break;
							else {
								x = w ? x : x - p | 0;
								q = q >>> 1;
								m = m + -1 | 0
							}
						}
						p = (n + 2 - r | 0) >>> 1;
						x = z + 1 - p | 0;
						w = x;
						r = p;
						p = l - ((_(x, z + 2 - p | 0) | 0) >> 1) | 0
					}
					x = _(y, l - (p + w) | 0) | 0;
					y = v + 32 | 0;
					q = (c[y >> 2] | 0) - x | 0;
					c[y >> 2] = q;
					if (!p) {
						p = v + 28 | 0;
						a = p;
						x = (c[p >> 2] | 0) - x | 0
					} else {
						a = v + 28 | 0;
						x = _(c[v + 36 >> 2] | 0, w) | 0
					}
					c[a >> 2] = x;
					m = v + 20 | 0;
					n = v + 40 | 0;
					l = v + 24 | 0;
					u = v + 4 | 0;
					while (1) {
						if (x >>> 0 >= 8388609) {
							y = 62;
							break d
						}
						c[m >> 2] = (c[m >> 2] | 0) + 8;
						x = x << 8;
						c[a >> 2] = x;
						w = c[n >> 2] | 0;
						p = c[l >> 2] | 0;
						if (p >>> 0 < (c[u >> 2] | 0) >>> 0) {
							c[l >> 2] = p + 1;
							p = d[(c[v >> 2] | 0) + p >> 0] | 0
						} else p = 0;
						c[n >> 2] = p;
						p = ((w << 8 | p) >>> 1 & 255 | q << 8 & 2147483392) ^ 255;
						c[y >> 2] = p;
						q = p
					}
				}
			while (0);
			if ((y | 0) == 61) q = (q << 14 >>> 0) / (z >>> 0) | 0;
			else if ((y | 0) == 62) {
				q = (r << 14 >>> 0) / (z >>> 0) | 0;
				if (A) {
					m = 0;
					break
				}
			}
			if (B) m = 0;
			else {
				if (!q) {
					Ra(D, f, h, C, E, i);
					m = 0;
					q = 0;
					break
				} else p = 0;
				while (1) {
					if ((p | 0) >= (i | 0)) {
						m = 0;
						break b
					}
					D = f + (p << 2) | 0;
					s = +g[D >> 2] * .7071067690849304;
					E = h + (p << 2) | 0;
					t = +g[E >> 2] * .7071067690849304;
					g[D >> 2] = s + t;
					g[E >> 2] = t - s;
					p = p + 1 | 0
				}
			}
		}
		while (0);
		h = c[I >> 2] | 0;
		f = 32 - (aa(h | 0) | 0) | 0;
		h = h >>> (f + -16 | 0);
		p = (h >>> 12) + -8 | 0;
		p = (c[G >> 2] << 3) - ((f << 3) + (p + (h >>> 0 > (c[6720 + (p << 2) >> 2] | 0) >>> 0 & 1))) + (F - H) | 0;
		c[j >> 2] = (c[j >> 2] | 0) - p;
		e: do
			if ((q | 0) < 16384) {
				switch (q | 0) {
					case 0:
						break;
					default:
						break e
				}
				c[o >> 2] = c[o >> 2] & (1 << k) + -1;
				E = 32767;
				f = 0;
				h = -16384;
				c[e >> 2] = m;
				F = e + 4 | 0;
				c[F >> 2] = E;
				F = e + 8 | 0;
				c[F >> 2] = f;
				F = e + 12 | 0;
				c[F >> 2] = h;
				F = e + 16 | 0;
				c[F >> 2] = q;
				F = e + 20 | 0;
				c[F >> 2] = p;
				return
			} else {
				switch (q | 0) {
					case 16384:
						break;
					default:
						break e
				}
				c[o >> 2] = c[o >> 2] & (1 << k) + -1 << k;
				E = 0;
				f = 32767;
				h = 16384;
				c[e >> 2] = m;
				F = e + 4 | 0;
				c[F >> 2] = E;
				F = e + 8 | 0;
				c[F >> 2] = f;
				F = e + 12 | 0;
				c[F >> 2] = h;
				F = e + 16 | 0;
				c[F >> 2] = q;
				F = e + 20 | 0;
				c[F >> 2] = p;
				return
			}
		while (0);
		E = q << 16 >> 16;
		E = ((_(E, E) | 0) + 4096 | 0) >>> 13;
		f = E << 16 >> 16;
		E = (32767 - E + (((_(f, (((_(f, (((_(E << 16 >> 16, -626) | 0) + 16384 | 0) >>> 15 << 16) + 542441472 >> 16) | 0) + 16384 | 0) >>> 15 << 16) + -501415936 >> 16) | 0) + 16384 | 0) >>> 15) << 16) + 65536 >> 16;
		f = 16384 - q << 16 >> 16;
		f = ((_(f, f) | 0) + 4096 | 0) >>> 13;
		D = f << 16 >> 16;
		f = (32767 - f + (((_(D, (((_(D, (((_(f << 16 >> 16, -626) | 0) + 16384 | 0) >>> 15 << 16) + 542441472 >> 16) | 0) + 16384 | 0) >>> 15 << 16) + -501415936 >> 16) | 0) + 16384 | 0) >>> 15) << 16) + 65536 >> 16;
		D = 32 - (aa(E | 0) | 0) | 0;
		C = 32 - (aa(f | 0) | 0) | 0;
		F = f << 15 - C << 16 >> 16;
		h = E << 15 - D << 16 >> 16;
		h = (_((i << 23) + -8388608 >> 16, (C - D << 11) + (((_(F, (((_(F, -2597) | 0) + 16384 | 0) >>> 15 << 16) + 519831552 >> 16) | 0) + 16384 | 0) >>> 15) - (((_(h, (((_(h, -2597) | 0) + 16384 | 0) >>> 15 << 16) + 519831552 >> 16) | 0) + 16384 | 0) >>> 15) << 16 >> 16) | 0) + 16384 >> 15;
		c[e >> 2] = m;
		F = e + 4 | 0;
		c[F >> 2] = E;
		F = e + 8 | 0;
		c[F >> 2] = f;
		F = e + 12 | 0;
		c[F >> 2] = h;
		F = e + 16 | 0;
		c[F >> 2] = q;
		F = e + 20 | 0;
		c[F >> 2] = p;
		return
	}

	function Ra(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0.0,
			j = 0.0,
			k = 0.0;
		i = +g[e + (f << 2) >> 2];
		k = +g[e + ((c[a + 8 >> 2] | 0) + f << 2) >> 2];
		j = +O(+(i * i + 1.0000000036274937e-15 + k * k)) + 1.0000000036274937e-15;
		i = i / j;
		j = k / j;
		a = 0;
		while (1) {
			if ((a | 0) >= (h | 0)) break;
			e = b + (a << 2) | 0;
			g[e >> 2] = i * +g[e >> 2] + j * +g[d + (a << 2) >> 2];
			a = a + 1 | 0
		}
		return
	}

	function Sa(a, b, d, e, f, h, i, j, l, m, n, o) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = +h;
		i = +i;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0.0,
			u = 0.0,
			v = 0,
			w = 0,
			x = 0,
			y = 0.0,
			z = 0.0,
			A = 0.0,
			B = 0,
			C = 0,
			D = 0.0,
			E = 0.0;
		if (h == 0.0 & i == 0.0) {
			if ((b | 0) == (a | 0)) return;
			uc(a | 0, b | 0, f << 2 | 0) | 0;
			return
		}
		t = +g[1536 + (j * 12 | 0) >> 2] * h;
		u = +g[1536 + (j * 12 | 0) + 4 >> 2] * h;
		s = +g[1536 + (j * 12 | 0) + 8 >> 2] * h;
		y = +g[1536 + (l * 12 | 0) >> 2] * i;
		z = +g[1536 + (l * 12 | 0) + 4 >> 2] * i;
		A = +g[1536 + (l * 12 | 0) + 8 >> 2] * i;
		v = 1 - e | 0;
		w = ~e;
		x = -2 - e | 0;
		o = h == i & (d | 0) == (e | 0) & (j | 0) == (l | 0) ? 0 : n;
		n = (o | 0) > 0;
		j = 0;
		l = c[b + (v << 2) >> 2] | 0;
		r = c[b + (0 - e << 2) >> 2] | 0;
		q = c[b + (w << 2) >> 2] | 0;
		p = c[b + (x << 2) >> 2] | 0;
		while (1) {
			if ((j | 0) >= (o | 0)) break;
			C = c[b + (j - e + 2 << 2) >> 2] | 0;
			D = +g[m + (j << 2) >> 2];
			D = D * D;
			h = 1.0 - D;
			B = j - d | 0;
			h = +g[b + (j << 2) >> 2] + h * t * +g[b + (B << 2) >> 2] + h * u * (+g[b + (B + 1 << 2) >> 2] + +g[b + (B + -1 << 2) >> 2]) + h * s * (+g[b + (B + 2 << 2) >> 2] + +g[b + (B + -2 << 2) >> 2]) + D * y * (c[k >> 2] = r, +g[k >> 2]);
			E = (c[k >> 2] = l, +g[k >> 2]);
			E = h + D * z * (E + (c[k >> 2] = q, +g[k >> 2]));
			h = (c[k >> 2] = C, +g[k >> 2]);
			g[a + (j << 2) >> 2] = E + D * A * (h + (c[k >> 2] = p, +g[k >> 2]));
			B = l;
			j = j + 1 | 0;
			l = C;
			p = q;
			q = r;
			r = B
		}
		n = n ? o : 0;
		if (i == 0.0) {
			if ((b | 0) == (a | 0)) return;
			uc(a + (o << 2) | 0, b + (o << 2) | 0, f - o << 2 | 0) | 0;
			return
		} else {
			l = f - n | 0;
			j = 0;
			q = c[b + (n + v << 2) >> 2] | 0;
			r = c[b + (n - e << 2) >> 2] | 0;
			p = c[b + (n + w << 2) >> 2] | 0;
			o = c[b + (n + x << 2) >> 2] | 0;
			while (1) {
				if ((j | 0) >= (l | 0)) break;
				C = c[b + (n + (j - e + 2) << 2) >> 2] | 0;
				h = +g[b + (n + j << 2) >> 2] + y * (c[k >> 2] = r, +g[k >> 2]);
				s = (c[k >> 2] = q, +g[k >> 2]);
				s = h + z * (s + (c[k >> 2] = p, +g[k >> 2]));
				h = (c[k >> 2] = C, +g[k >> 2]);
				g[a + (n + j << 2) >> 2] = s + A * (h + (c[k >> 2] = o, +g[k >> 2]));
				f = q;
				j = j + 1 | 0;
				q = C;
				o = p;
				p = r;
				r = f
			}
			return
		}
	}

	function Ta(e, f, h, j, l, m, n) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0.0,
			z = 0,
			A = 0,
			B = 0.0,
			C = 0.0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			Y = 0,
			Z = 0,
			$ = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0,
			ja = 0,
			ka = 0,
			la = 0,
			ma = 0,
			oa = 0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ta = 0,
			ua = 0,
			wa = 0,
			xa = 0,
			ya = 0,
			za = 0,
			Aa = 0,
			Ba = 0,
			Ca = 0,
			Da = 0,
			Ea = 0,
			Fa = 0,
			Ga = 0,
			Ha = 0,
			Ia = 0,
			Ja = 0,
			La = 0,
			Ma = 0,
			Na = 0,
			Oa = 0,
			Pa = 0.0,
			Qa = 0.0;
		Oa = i;
		i = i + 96 | 0;
		ja = Oa;
		ka = Oa + 40 | 0;
		o = Oa + 48 | 0;
		Z = Oa + 32 | 0;
		Na = Oa + 24 | 0;
		ca = Oa + 16 | 0;
		ba = Oa + 12 | 0;
		$ = Oa + 8 | 0;
		Ha = c[e + 8 >> 2] | 0;
		c[ca >> 2] = 0;
		c[ba >> 2] = 0;
		la = c[e + 12 >> 2] | 0;
		Ga = c[e >> 2] | 0;
		ha = Ga + 8 | 0;
		Ma = c[ha >> 2] | 0;
		ya = c[Ga + 4 >> 2] | 0;
		ia = Ga + 32 | 0;
		V = c[ia >> 2] | 0;
		Ia = c[e + 20 >> 2] | 0;
		Ja = c[e + 24 >> 2] | 0;
		La = e + 16 | 0;
		Fa = _(c[La >> 2] | 0, l) | 0;
		Ca = _(ya + 2072 | 0, Ha) | 0;
		qa = e + 84 + (Ca << 2) | 0;
		Aa = Ma << 1;
		Da = Ca + Aa | 0;
		ra = e + 84 + (Da << 2) | 0;
		Ea = Da + Aa | 0;
		sa = e + 84 + (Ea << 2) | 0;
		za = Ea + Aa | 0;
		ta = Ga + 44 | 0;
		l = c[Ga + 36 >> 2] | 0;
		oa = 0;
		while (1) {
			if ((oa | 0) > (l | 0)) {
				o = -1;
				M = 211;
				break
			}
			if ((c[ta >> 2] << oa | 0) == (Fa | 0)) break;
			oa = oa + 1 | 0
		}
		if ((M | 0) == 211) {
			i = Oa;
			return o | 0
		}
		pa = 1 << oa;
		if ((h | 0) < 0 | (h | 0) > 1275 | (j | 0) == 0) {
			ja = -1;
			i = Oa;
			return ja | 0
		}
		Ba = c[ta >> 2] << oa;
		l = ya + 2048 | 0;
		Y = 2048 - Ba | 0;
		p = 0;
		do {
			ga = _(p, l) | 0;
			c[Z + (p << 2) >> 2] = e + 84 + (ga << 2);
			c[Na + (p << 2) >> 2] = e + 84 + (ga + Y << 2);
			p = p + 1 | 0
		} while ((p | 0) < (Ha | 0));
		ga = c[Ga + 12 >> 2] | 0;
		ga = (Ja | 0) > (ga | 0) ? ga : Ja;
		if ((f | 0) == 0 | (h | 0) < 2) {
			Va(e, Ba, oa);
			Wa(Na, j, Ba, Ha, c[La >> 2] | 0, Ga + 16 | 0, e + 76 | 0, n);
			ja = (Fa | 0) / (c[La >> 2] | 0) | 0;
			i = Oa;
			return ja | 0
		}
		if (!m) {
			Ya(o, f, h);
			m = o
		}
		ma = (la | 0) == 1;
		a: do
			if (ma) {
				l = 0;
				while (1) {
					if ((l | 0) >= (Ma | 0)) break a;
					fa = e + 84 + (Ca + l << 2) | 0;
					y = +g[fa >> 2];
					q = +g[e + 84 + (Ca + (Ma + l) << 2) >> 2];
					g[fa >> 2] = y > q ? y : q;
					l = l + 1 | 0
				}
			}
		while (0);
		ua = h << 3;
		wa = m + 20 | 0;
		l = c[wa >> 2] | 0;
		xa = m + 28 | 0;
		w = c[xa >> 2] | 0;
		p = l + ((aa(w | 0) | 0) + -32) | 0;
		if ((p | 0) < (ua | 0))
			if ((p | 0) == 1) {
				o = c[m + 32 >> 2] | 0;
				p = w >>> 15;
				x = o >>> 0 < p >>> 0;
				f = x & 1;
				if (!x) {
					c[m + 32 >> 2] = o - p;
					p = w - p | 0
				}
				l = m + 28 | 0;
				c[l >> 2] = p;
				r = m + 20 | 0;
				s = m + 40 | 0;
				t = m + 24 | 0;
				u = m + 4 | 0;
				v = m + 32 | 0;
				while (1) {
					if (p >>> 0 >= 8388609) break;
					c[r >> 2] = (c[r >> 2] | 0) + 8;
					p = p << 8;
					c[l >> 2] = p;
					o = c[s >> 2] | 0;
					w = c[t >> 2] | 0;
					if (w >>> 0 < (c[u >> 2] | 0) >>> 0) {
						c[t >> 2] = w + 1;
						w = d[(c[m >> 2] | 0) + w >> 0] | 0
					} else w = 0;
					c[s >> 2] = w;
					c[v >> 2] = ((o << 8 | w) >>> 1 & 255 | c[v >> 2] << 8 & 2147483392) ^ 255
				}
				if (x) {
					w = c[xa >> 2] | 0;
					l = c[wa >> 2] | 0;
					M = 26
				} else {
					f = 0;
					p = 1
				}
			} else f = 0;
		else {
			f = 1;
			M = 26
		}
		if ((M | 0) == 26) {
			c[wa >> 2] = l + (ua - (l + ((aa(w | 0) | 0) + -32)));
			p = ua
		}
		if ((Ia | 0) != 0 | (p + 16 | 0) > (ua | 0)) {
			fa = 0;
			ea = 0;
			da = 0
		} else {
			w = c[xa >> 2] | 0;
			o = c[m + 32 >> 2] | 0;
			p = w >>> 1;
			x = o >>> 0 < p >>> 0;
			if (!x) {
				c[m + 32 >> 2] = o - p;
				p = w - p | 0
			}
			l = m + 28 | 0;
			c[l >> 2] = p;
			r = m + 20 | 0;
			s = m + 40 | 0;
			t = m + 24 | 0;
			u = m + 4 | 0;
			v = m + 32 | 0;
			while (1) {
				if (p >>> 0 >= 8388609) break;
				c[r >> 2] = (c[r >> 2] | 0) + 8;
				p = p << 8;
				c[l >> 2] = p;
				o = c[s >> 2] | 0;
				w = c[t >> 2] | 0;
				if (w >>> 0 < (c[u >> 2] | 0) >>> 0) {
					c[t >> 2] = w + 1;
					w = d[(c[m >> 2] | 0) + w >> 0] | 0
				} else w = 0;
				c[s >> 2] = w;
				c[v >> 2] = ((o << 8 | w) >>> 1 & 255 | c[v >> 2] << 8 & 2147483392) ^ 255
			}
			if (x) {
				w = _a(m, 6) | 0;
				w = (16 << w) + ($a(m, w + 4 | 0) | 0) + -1 | 0;
				l = $a(m, 3) | 0;
				if (((c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) + 2 | 0) > (ua | 0)) p = 0;
				else p = Za(m, 22538, 2) | 0;
				o = (g[k >> 2] = +(l + 1 | 0) * .09375, c[k >> 2] | 0)
			} else {
				o = 0;
				w = 0;
				p = 0
			}
			fa = o;
			ea = w;
			da = p;
			p = (c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) | 0
		}
		L = (oa | 0) > 0;
		if (L ^ 1 | (p + 3 | 0) > (ua | 0)) {
			W = 0;
			U = 0
		} else {
			w = c[xa >> 2] | 0;
			o = c[m + 32 >> 2] | 0;
			p = w >>> 3;
			z = o >>> 0 < p >>> 0;
			v = z & 1;
			if (!z) {
				c[m + 32 >> 2] = o - p;
				p = w - p | 0
			}
			o = m + 28 | 0;
			c[o >> 2] = p;
			l = m + 20 | 0;
			r = m + 40 | 0;
			s = m + 24 | 0;
			t = m + 4 | 0;
			u = m + 32 | 0;
			while (1) {
				if (p >>> 0 >= 8388609) break;
				c[l >> 2] = (c[l >> 2] | 0) + 8;
				p = p << 8;
				c[o >> 2] = p;
				x = c[r >> 2] | 0;
				w = c[s >> 2] | 0;
				if (w >>> 0 < (c[t >> 2] | 0) >>> 0) {
					c[s >> 2] = w + 1;
					w = d[(c[m >> 2] | 0) + w >> 0] | 0
				} else w = 0;
				c[r >> 2] = w;
				c[u >> 2] = ((x << 8 | w) >>> 1 & 255 | c[u >> 2] << 8 & 2147483392) ^ 255
			}
			p = (c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) | 0;
			W = z ? v : 0;
			U = z ? pa : 0
		}
		if ((p + 3 | 0) <= (ua | 0)) {
			o = c[xa >> 2] | 0;
			p = c[m + 32 >> 2] | 0;
			l = o >>> 3;
			T = p >>> 0 < l >>> 0;
			w = T & 1;
			if (!T) {
				c[m + 32 >> 2] = p - l;
				l = o - l | 0
			}
			p = m + 28 | 0;
			c[p >> 2] = l;
			r = m + 20 | 0;
			s = m + 40 | 0;
			t = m + 24 | 0;
			u = m + 4 | 0;
			v = m + 32 | 0;
			while (1) {
				if (l >>> 0 >= 8388609) break;
				c[r >> 2] = (c[r >> 2] | 0) + 8;
				l = l << 8;
				c[p >> 2] = l;
				o = c[s >> 2] | 0;
				x = c[t >> 2] | 0;
				if (x >>> 0 < (c[u >> 2] | 0) >>> 0) {
					c[t >> 2] = x + 1;
					x = d[(c[m >> 2] | 0) + x >> 0] | 0
				} else x = 0;
				c[s >> 2] = x;
				c[v >> 2] = ((o << 8 | x) >>> 1 & 255 | c[v >> 2] << 8 & 2147483392) ^ 255
			}
			T = ja;
			c[T >> 2] = 0;
			c[T + 4 >> 2] = 0;
			if (!w) {
				o = ja;
				M = 59
			} else {
				x = 1041864704;
				z = 0;
				o = ja
			}
		} else {
			w = ja;
			c[w >> 2] = 0;
			c[w + 4 >> 2] = 0;
			w = 0;
			o = ja;
			M = 59
		}
		if ((M | 0) == 59) {
			x = c[18708 + (oa << 2) >> 2] | 0;
			z = c[18692 + (oa << 2) >> 2] | 0
		}
		H = m + 4 | 0;
		A = c[H >> 2] << 3;
		v = m + 36 | 0;
		M = m + 32 | 0;
		J = m + 32 | 0;
		K = m + 28 | 0;
		P = m + 20 | 0;
		Q = m + 40 | 0;
		R = m + 24 | 0;
		S = m + 4 | 0;
		G = m + 36 | 0;
		B = (c[k >> 2] = z, +g[k >> 2]);
		C = (c[k >> 2] = x, +g[k >> 2]);
		D = Ia;
		while (1) {
			if ((D | 0) >= (Ja | 0)) break;
			F = (D | 0) < 20;
			E = 0;
			do {
				p = c[xa >> 2] | 0;
				z = (c[wa >> 2] | 0) + ((aa(p | 0) | 0) + -32) | 0;
				x = A - z | 0;
				b: do
					if ((x | 0) <= 14) {
						if ((x | 0) > 1) {
							z = Za(m, 23683, 2) | 0;
							z = z >> 1 ^ 0 - (z & 1);
							break
						}
						if ((A | 0) > (z | 0)) {
							x = c[M >> 2] | 0;
							z = p >>> 1;
							l = x >>> 0 < z >>> 0;
							if (!l) {
								c[J >> 2] = x - z;
								z = p - z | 0
							}
							c[K >> 2] = z;
							while (1) {
								if (z >>> 0 >= 8388609) break;
								c[P >> 2] = (c[P >> 2] | 0) + 8;
								z = z << 8;
								c[K >> 2] = z;
								p = c[Q >> 2] | 0;
								x = c[R >> 2] | 0;
								if (x >>> 0 < (c[S >> 2] | 0) >>> 0) {
									c[R >> 2] = x + 1;
									x = d[(c[m >> 2] | 0) + x >> 0] | 0
								} else x = 0;
								c[Q >> 2] = x;
								c[J >> 2] = ((p << 8 | x) >>> 1 & 255 | c[J >> 2] << 8 & 2147483392) ^ 255
							}
							z = l << 31 >> 31
						} else z = -1
					} else {
						s = (F ? D : 20) << 1;
						z = d[23347 + (oa * 84 | 0) + (w * 42 | 0) + s >> 0] << 7;
						s = d[(s | 1) + (23347 + (oa * 84 | 0) + (w * 42 | 0)) >> 0] << 6;
						u = p >>> 15;
						c[v >> 2] = u;
						t = ((c[M >> 2] | 0) >>> 0) / (u >>> 0) | 0;
						T = t + 1 | 0;
						t = 32768 - (T + (T >>> 0 > 32768 ? 32767 - t | 0 : 0)) | 0;
						if (t >>> 0 < z >>> 0) {
							x = z;
							r = 0;
							z = 0
						} else {
							x = ((_(32736 - z | 0, 16384 - s | 0) | 0) >>> 15) + 1 | 0;
							p = 1;
							while (1) {
								if (x >>> 0 <= 1) break;
								l = x << 1;
								r = z + l | 0;
								if (t >>> 0 < r >>> 0) break;
								x = ((_(l + -2 | 0, s) | 0) >>> 15) + 1 | 0;
								z = r;
								p = p + 1 | 0
							}
							if (x >>> 0 < 2) {
								T = (t - z | 0) >>> 1;
								z = z + (T << 1) | 0;
								p = p + T | 0
							}
							r = z + x | 0;
							T = t >>> 0 < r >>> 0;
							r = T ? z : r;
							z = T ? 0 - p | 0 : p
						}
						p = r + x | 0;
						p = p >>> 0 < 32768 ? p : 32768;
						x = _(u, 32768 - p | 0) | 0;
						l = (c[J >> 2] | 0) - x | 0;
						c[J >> 2] = l;
						if (!r) x = (c[K >> 2] | 0) - x | 0;
						else x = _(c[G >> 2] | 0, p - r | 0) | 0;
						c[K >> 2] = x;
						r = l;
						while (1) {
							if (x >>> 0 >= 8388609) break b;
							c[P >> 2] = (c[P >> 2] | 0) + 8;
							x = x << 8;
							c[K >> 2] = x;
							l = c[Q >> 2] | 0;
							p = c[R >> 2] | 0;
							if (p >>> 0 < (c[S >> 2] | 0) >>> 0) {
								c[R >> 2] = p + 1;
								p = d[(c[m >> 2] | 0) + p >> 0] | 0
							} else p = 0;
							c[Q >> 2] = p;
							T = ((l << 8 | p) >>> 1 & 255 | r << 8 & 2147483392) ^ 255;
							c[J >> 2] = T;
							r = T
						}
					}
				while (0);
				q = +(z | 0);
				N = e + 84 + (Ca + (D + (_(E, c[ha >> 2] | 0) | 0)) << 2) | 0;
				y = +g[N >> 2];
				g[N >> 2] = y < -9.0 ? -9.0 : y;
				N = e + 84 + (Ca + (D + (_(E, c[ha >> 2] | 0) | 0)) << 2) | 0;
				T = o + (E << 2) | 0;
				g[N >> 2] = B * +g[N >> 2] + +g[T >> 2] + q;
				g[T >> 2] = +g[T >> 2] + q - C * q;
				E = E + 1 | 0
			} while ((E | 0) < (la | 0));
			D = D + 1 | 0
		}
		T = na() | 0;
		N = i;
		i = i + ((1 * (Ma << 2) | 0) + 15 & -16) | 0;
		x = c[H >> 2] << 3;
		o = (c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) | 0;
		w = (W | 0) != 0;
		z = w ? 2 : 4;
		if (L) v = (o + z + 1 | 0) >>> 0 <= x >>> 0;
		else v = 0;
		u = x - (v & 1) | 0;
		t = w ? 4 : 5;
		r = 0;
		s = Ia;
		x = o;
		w = 0;
		while (1) {
			if ((s | 0) >= (Ja | 0)) break;
			if ((x + z | 0) >>> 0 > u >>> 0) z = r;
			else {
				o = c[xa >> 2] | 0;
				p = c[M >> 2] | 0;
				x = o >>> z;
				L = p >>> 0 < x >>> 0;
				l = L & 1;
				if (!L) {
					c[J >> 2] = p - x;
					x = o - x | 0
				}
				c[K >> 2] = x;
				while (1) {
					if (x >>> 0 >= 8388609) break;
					c[P >> 2] = (c[P >> 2] | 0) + 8;
					x = x << 8;
					c[K >> 2] = x;
					o = c[Q >> 2] | 0;
					z = c[R >> 2] | 0;
					if (z >>> 0 < (c[S >> 2] | 0) >>> 0) {
						c[R >> 2] = z + 1;
						z = d[(c[m >> 2] | 0) + z >> 0] | 0
					} else z = 0;
					c[Q >> 2] = z;
					c[J >> 2] = ((o << 8 | z) >>> 1 & 255 | c[J >> 2] << 8 & 2147483392) ^ 255
				}
				L = r ^ l;
				z = L;
				x = (c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) | 0;
				w = w | L
			}
			c[N + (s << 2) >> 2] = z;
			r = z;
			z = t;
			s = s + 1 | 0
		}
		o = W << 2;
		c: do
			if (v ? (a[o + w + (22506 + (oa << 3)) >> 0] | 0) != (a[(o | 2) + w + (22506 + (oa << 3)) >> 0] | 0) : 0) {
				p = c[xa >> 2] | 0;
				l = c[M >> 2] | 0;
				x = p >>> 1;
				L = l >>> 0 < x >>> 0;
				w = L & 1;
				if (!L) {
					c[J >> 2] = l - x;
					x = p - x | 0
				}
				c[K >> 2] = x;
				while (1) {
					if (x >>> 0 >= 8388609) break c;
					c[P >> 2] = (c[P >> 2] | 0) + 8;
					x = x << 8;
					c[K >> 2] = x;
					l = c[Q >> 2] | 0;
					p = c[R >> 2] | 0;
					if (p >>> 0 < (c[S >> 2] | 0) >>> 0) {
						c[R >> 2] = p + 1;
						p = d[(c[m >> 2] | 0) + p >> 0] | 0
					} else p = 0;
					c[Q >> 2] = p;
					c[J >> 2] = ((l << 8 | p) >>> 1 & 255 | c[J >> 2] << 8 & 2147483392) ^ 255
				}
			} else w = 0;
		while (0);
		w = o | w << 1;
		o = Ia;
		while (1) {
			if ((o | 0) >= (Ja | 0)) break;
			L = N + (o << 2) | 0;
			c[L >> 2] = a[w + (c[L >> 2] | 0) + (22506 + (oa << 3)) >> 0];
			o = o + 1 | 0
		}
		if (((c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) + 4 | 0) > (ua | 0)) I = 2;
		else I = Za(m, 22541, 5) | 0;
		F = i;
		i = i + ((1 * (Ma << 2) | 0) + 15 & -16) | 0;
		x = (oa << 1) + la + -1 | 0;
		w = Ga + 104 | 0;
		p = 0;
		while (1) {
			o = c[ha >> 2] | 0;
			if ((p | 0) >= (o | 0)) break;
			L = p + 1 | 0;
			v = c[ia >> 2] | 0;
			u = (_(o, x) | 0) + p | 0;
			c[F + (p << 2) >> 2] = (_(_((d[(c[w >> 2] | 0) + u >> 0] | 0) + 64 | 0, la) | 0, (b[v + (L << 1) >> 1] | 0) - (b[v + (p << 1) >> 1] | 0) << oa) | 0) >> 2;
			p = L
		}
		D = i;
		i = i + ((1 * (Ma << 2) | 0) + 15 & -16) | 0;
		x = c[xa >> 2] | 0;
		L = 32 - (aa(x | 0) | 0) | 0;
		x = x >>> (L + -16 | 0);
		z = (x >>> 12) + -8 | 0;
		s = V;
		v = 6;
		A = Ia;
		z = (c[wa >> 2] << 3) - ((L << 3) + (z + (x >>> 0 > (c[6720 + (z << 2) >> 2] | 0) >>> 0 & 1))) | 0;
		x = h << 6;
		while (1) {
			if ((A | 0) >= (Ja | 0)) break;
			t = A + 1 | 0;
			p = (_(la, (b[s + (t << 1) >> 1] | 0) - (b[s + (A << 1) >> 1] | 0) | 0) | 0) << oa;
			u = p << 3;
			l = (p | 0) < 48;
			p = (u | 0) < ((l ? 48 : p) | 0) ? u : l ? 48 : p;
			l = F + (A << 2) | 0;
			u = 0;
			o = v;
			r = x;
			while (1) {
				if ((z + (o << 3) | 0) >= (r | 0)) break;
				if ((u | 0) >= (c[l >> 2] | 0)) break;
				x = c[xa >> 2] | 0;
				w = c[M >> 2] | 0;
				z = x >>> o;
				o = w >>> 0 < z >>> 0;
				if (!o) {
					c[J >> 2] = w - z;
					z = x - z | 0
				}
				c[K >> 2] = z;
				while (1) {
					if (z >>> 0 >= 8388609) break;
					c[P >> 2] = (c[P >> 2] | 0) + 8;
					z = z << 8;
					c[K >> 2] = z;
					w = c[Q >> 2] | 0;
					x = c[R >> 2] | 0;
					if (x >>> 0 < (c[S >> 2] | 0) >>> 0) {
						c[R >> 2] = x + 1;
						x = d[(c[m >> 2] | 0) + x >> 0] | 0
					} else x = 0;
					c[Q >> 2] = x;
					c[J >> 2] = ((w << 8 | x) >>> 1 & 255 | c[J >> 2] << 8 & 2147483392) ^ 255
				}
				V = c[xa >> 2] | 0;
				L = 32 - (aa(V | 0) | 0) | 0;
				V = V >>> (L + -16 | 0);
				z = (V >>> 12) + -8 | 0;
				z = (c[wa >> 2] << 3) - ((L << 3) + (z + (V >>> 0 > (c[6720 + (z << 2) >> 2] | 0) >>> 0 & 1))) | 0;
				if (!o) break;
				u = u + p | 0;
				o = 1;
				r = r - p | 0
			}
			c[D + (A << 2) >> 2] = u;
			if ((u | 0) <= 0) {
				A = t;
				x = r;
				continue
			}
			v = (v | 0) < 3 ? 2 : v + -1 | 0;
			A = t;
			x = r
		}
		E = i;
		i = i + ((1 * (Ma << 2) | 0) + 15 & -16) | 0;
		if ((z + 48 | 0) > (x | 0)) w = 5;
		else w = Za(m, 22545, 7) | 0;
		l = h << 6;
		M = c[xa >> 2] | 0;
		h = 32 - (aa(M | 0) | 0) | 0;
		M = M >>> (h + -16 | 0);
		x = (M >>> 12) + -8 | 0;
		x = l + ((h << 3) + (x + (M >>> 0 > (c[6720 + (x << 2) >> 2] | 0) >>> 0 & 1)) - (c[wa >> 2] << 3)) + -1 | 0;
		M = (W | 0) == 0;
		if ((M ^ 1) & (oa | 0) > 1) r = (x | 0) >= ((oa << 3) + 16 | 0);
		else r = 0;
		s = r ? 8 : 0;
		K = i;
		i = i + ((1 * (Ma << 2) | 0) + 15 & -16) | 0;
		u = i;
		i = i + ((1 * (Ma << 2) | 0) + 15 & -16) | 0;
		z = nb(Ga, Ia, Ja, D, F, w, ca, ba, x - s | 0, $, K, E, u, la, oa, m) | 0;
		p = Ia;
		while (1) {
			if ((p | 0) >= (Ja | 0)) break;
			o = E + (p << 2) | 0;
			x = c[o >> 2] | 0;
			d: do
				if ((x | 0) >= 1) {
					w = 0;
					while (1) {
						q = +($a(m, x) | 0) + .5;
						h = e + 84 + (Ca + (p + (_(w, c[ha >> 2] | 0) | 0)) << 2) | 0;
						g[h >> 2] = +g[h >> 2] + (q * +(1 << 14 - (c[o >> 2] | 0) | 0) * .00006103515625 + -.5);
						w = w + 1 | 0;
						if ((w | 0) >= (la | 0)) break d;
						x = c[o >> 2] | 0
					}
				}
			while (0);
			p = p + 1 | 0
		}
		w = Y + ((ya | 0) / 2 | 0) << 2;
		o = 0;
		do {
			Y = c[Z + (o << 2) >> 2] | 0;
			uc(Y | 0, Y + (Ba << 2) | 0, w | 0) | 0;
			o = o + 1 | 0
		} while ((o | 0) < (Ha | 0));
		F = _(la, Ma) | 0;
		G = i;
		i = i + ((1 * F | 0) + 15 & -16) | 0;
		L = (_(la, Ba) | 0) << 2;
		H = i;
		i = i + ((1 * L | 0) + 15 & -16) | 0;
		L = e + 36 | 0;
		J = e + 32 | 0;
		Ka(Ga, Ia, Ja, H, (la | 0) == 2 ? H + (Ba << 2) | 0 : 0, G, K, U, I, c[ba >> 2] | 0, c[ca >> 2] | 0, N, l - s | 0, c[$ >> 2] | 0, m, oa, z, L, c[J >> 2] | 0);
		if (r) s = $a(m, 1) | 0;
		else s = 0;
		w = ua - ((c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32)) | 0;
		r = (la | 0) > 1 ? 0 - la | 0 : -1;
		t = 0;
		while (1) {
			if ((t | 0) == 2) break;
			else l = Ia;
			while (1) {
				if (!((l | 0) < (Ja | 0) & (w | 0) >= (la | 0))) break;
				o = E + (l << 2) | 0;
				do
					if ((c[o >> 2] | 0) <= 7) {
						if ((c[u + (l << 2) >> 2] | 0) == (t | 0)) p = 0;
						else break;
						do {
							q = +($a(m, 1) | 0) + -.5;
							ca = e + 84 + (Ca + (l + (_(p, c[ha >> 2] | 0) | 0)) << 2) | 0;
							g[ca >> 2] = +g[ca >> 2] + q * +(1 << 14 - (c[o >> 2] | 0) + -1 | 0) * .00006103515625;
							p = p + 1 | 0
						} while ((p | 0) < (la | 0));
						w = r + w | 0
					}
				while (0);
				l = l + 1 | 0
			}
			t = t + 1 | 0
		}
		if (s) {
			A = (oa | 0) == 3;
			w = c[L >> 2] | 0;
			E = Ia;
			e: while (1) {
				if ((E | 0) >= (Ja | 0)) break;
				t = E + 1 | 0;
				u = c[ia >> 2] | 0;
				u = (b[u + (t << 1) >> 1] | 0) - (b[u + (E << 1) >> 1] | 0) | 0;
				B = +X(+(+(((((c[K + (E << 2) >> 2] | 0) + 1 | 0) >>> 0) / (u >>> 0) | 0) >>> oa | 0) * -.125 * .6931471805599453)) * .5;
				v = u << oa;
				C = 1.0 / +O(+(+(v | 0)));
				D = _(E, la) | 0;
				o = 0;
				while (1) {
					x = c[e + 84 + (Da + ((_(o, c[ha >> 2] | 0) | 0) + E) << 2) >> 2] | 0;
					c[ja >> 2] = x;
					p = c[e + 84 + (Ea + ((_(o, c[ha >> 2] | 0) | 0) + E) << 2) >> 2] | 0;
					c[ka >> 2] = p;
					y = (c[k >> 2] = x, +g[k >> 2]);
					q = (c[k >> 2] = p, +g[k >> 2]);
					if (ma) {
						x = e + 84 + (Da + ((c[ha >> 2] | 0) + E) << 2) | 0;
						x = c[(y > +g[x >> 2] ? ja : x) >> 2] | 0;
						c[ja >> 2] = x;
						p = e + 84 + (Ea + ((c[ha >> 2] | 0) + E) << 2) | 0;
						y = (c[k >> 2] = x, +g[k >> 2]);
						p = c[(q > +g[p >> 2] ? ka : p) >> 2] | 0;
						c[ka >> 2] = p;
						q = (c[k >> 2] = p, +g[k >> 2])
					}
					Qa = +g[e + 84 + (Ca + ((_(o, c[ha >> 2] | 0) | 0) + E) << 2) >> 2];
					Pa = (c[k >> 2] = x, +g[k >> 2]);
					y = Qa - (Pa < (c[k >> 2] = p, +g[k >> 2]) ? y : q);
					y = +X(+(-(y < 0.0 ? 0.0 : y) * .6931471805599453)) * 2.0;
					y = A ? y * 1.4142135381698608 : y;
					y = (B < y ? B : y) * C;
					s = _(o, Ba) | 0;
					s = s + (b[(c[ia >> 2] | 0) + (E << 1) >> 1] << oa) | 0;
					x = H + (s << 2) | 0;
					r = G + (D + o) | 0;
					q = -y;
					z = 0;
					l = 0;
					while (1) {
						if ((l | 0) >= (pa | 0)) break;
						f: do
							if (!(d[r >> 0] & 1 << l)) {
								p = 0;
								while (1) {
									if ((p | 0) >= (u | 0)) {
										z = 1;
										break f
									}
									ca = (_(w, 1664525) | 0) + 1013904223 | 0;
									g[H + (s + ((p << oa) + l) << 2) >> 2] = (ca & 32768 | 0) == 0 ? q : y;
									w = ca;
									p = p + 1 | 0
								}
							}
						while (0);
						l = l + 1 | 0
					}
					g: do
						if (z) {
							p = 0;
							y = 0.0;
							while (1) {
								if ((p | 0) >= (v | 0)) break;
								q = +g[H + (s + p << 2) >> 2];
								p = p + 1 | 0;
								y = y + q * q
							}
							y = 1.0 / +O(+(y + 1.0000000036274937e-15));
							p = 0;
							while (1) {
								if ((p | 0) >= (v | 0)) break g;
								g[x >> 2] = y * +g[x >> 2];
								p = p + 1 | 0;
								x = x + 4 | 0
							}
						}
					while (0);
					o = o + 1 | 0;
					if ((o | 0) >= (la | 0)) {
						E = t;
						continue e
					}
				}
			}
		}
		h: do
			if (f) {
				l = 0;
				while (1) {
					if ((l | 0) >= (F | 0)) break h;
					g[e + 84 + (Ca + l << 2) >> 2] = -28.0;
					l = l + 1 | 0
				}
			}
		while (0);
		Xa(Ga, H, Na, qa, Ia, ga, la, Ha, W, oa, c[La >> 2] | 0, f);
		o = e + 52 | 0;
		r = e + 56 | 0;
		s = e + 64 | 0;
		t = e + 60 | 0;
		u = e + 72 | 0;
		v = e + 68 | 0;
		w = Ga + 60 | 0;
		f = (oa | 0) == 0;
		q = (c[k >> 2] = fa, +g[k >> 2]);
		p = 0;
		do {
			ja = c[o >> 2] | 0;
			ja = (ja | 0) > 15 ? ja : 15;
			c[o >> 2] = ja;
			ga = c[r >> 2] | 0;
			ga = (ga | 0) > 15 ? ga : 15;
			c[r >> 2] = ga;
			l = c[Na + (p << 2) >> 2] | 0;
			Sa(l, l, ga, ja, c[ta >> 2] | 0, +g[s >> 2], +g[t >> 2], c[u >> 2] | 0, c[v >> 2] | 0, c[w >> 2] | 0, ya, c[J >> 2] | 0);
			if (!f) {
				ja = c[ta >> 2] | 0;
				ga = l + (ja << 2) | 0;
				Sa(ga, ga, c[o >> 2] | 0, ea, Ba - ja | 0, +g[t >> 2], q, c[v >> 2] | 0, da, c[w >> 2] | 0, ya, c[J >> 2] | 0)
			}
			p = p + 1 | 0
		} while ((p | 0) < (Ha | 0));
		c[r >> 2] = c[o >> 2];
		c[s >> 2] = c[t >> 2];
		c[u >> 2] = c[v >> 2];
		c[o >> 2] = ea;
		c[t >> 2] = fa;
		c[v >> 2] = da;
		if (!f) {
			c[r >> 2] = ea;
			c[s >> 2] = fa;
			c[u >> 2] = da
		}
		if (ma) tc(e + 84 + (Ca + Ma << 2) | 0, qa | 0, Ma << 2 | 0) | 0;
		i: do
			if (M) {
				l = Ma << 3;
				tc(sa | 0, ra | 0, l | 0) | 0;
				tc(ra | 0, qa | 0, l | 0) | 0;
				q = +(pa | 0) * 1.0000000474974513e-03;
				l = 0;
				while (1) {
					if ((l | 0) >= (Aa | 0)) {
						l = 0;
						break i
					}
					ja = e + 84 + (za + l << 2) | 0;
					B = +g[ja >> 2] + q;
					y = +g[e + 84 + (Ca + l << 2) >> 2];
					g[ja >> 2] = B < y ? B : y;
					l = l + 1 | 0
				}
			} else {
				o = 0;
				while (1) {
					if ((o | 0) >= (Aa | 0)) {
						l = 0;
						break i
					}
					ja = e + 84 + (Da + o << 2) | 0;
					y = +g[ja >> 2];
					q = +g[e + 84 + (Ca + o << 2) >> 2];
					g[ja >> 2] = y < q ? y : q;
					o = o + 1 | 0
				}
			}
		while (0);
		do {
			p = _(l, Ma) | 0;
			o = 0;
			while (1) {
				if ((o | 0) >= (Ia | 0)) {
					o = Ja;
					break
				}
				ja = p + o | 0;
				g[e + 84 + (Ca + ja << 2) >> 2] = 0.0;
				g[e + 84 + (Ea + ja << 2) >> 2] = -28.0;
				g[e + 84 + (Da + ja << 2) >> 2] = -28.0;
				o = o + 1 | 0
			}
			while (1) {
				if ((o | 0) >= (Ma | 0)) break;
				ja = p + o | 0;
				g[e + 84 + (Ca + ja << 2) >> 2] = 0.0;
				g[e + 84 + (Ea + ja << 2) >> 2] = -28.0;
				g[e + 84 + (Da + ja << 2) >> 2] = -28.0;
				o = o + 1 | 0
			}
			l = l + 1 | 0
		} while ((l | 0) != 2);
		c[L >> 2] = c[xa >> 2];
		Wa(Na, j, Ba, Ha, c[La >> 2] | 0, Ga + 16 | 0, e + 76 | 0, n);
		c[e + 48 >> 2] = 0;
		if (((c[wa >> 2] | 0) + ((aa(c[xa >> 2] | 0) | 0) + -32) | 0) > (ua | 0)) o = -3;
		else {
			if (c[m + 44 >> 2] | 0) c[e + 40 >> 2] = 1;
			o = (Fa | 0) / (c[La >> 2] | 0) | 0
		}
		va(T | 0);
		ja = o;
		i = Oa;
		return ja | 0
	}

	function Ua(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0;
		h = i;
		i = i + 16 | 0;
		f = h;
		c[f >> 2] = d;
		a: do switch (b | 0) {
				case 10010:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if ((b | 0) >= 0 ? (b | 0) < (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
							c[a + 20 >> 2] = b;
							b = 24
						} else b = 25;
						break
					}
				case 10012:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if ((b | 0) >= 1 ? (b | 0) <= (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
							c[a + 24 >> 2] = b;
							b = 24
						} else b = 25;
						break
					}
				case 10008:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if ((b | 0) < 1 | (b | 0) > 2) b = 25;
						else {
							c[a + 12 >> 2] = b;
							b = 24
						}
						break
					}
				case 10007:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if (!b) b = 25;
						else {
							d = a + 40 | 0;
							c[b >> 2] = c[d >> 2];
							c[d >> 2] = 0;
							b = 24
						}
						break
					}
				case 4027:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if (!b) b = 25;
						else {
							c[b >> 2] = (c[a + 4 >> 2] | 0) / (c[a + 16 >> 2] | 0) | 0;
							b = 24
						}
						break
					}
				case 4028:
					{
						f = c[a + 8 >> 2] | 0;d = _((c[a + 4 >> 2] | 0) + 2072 | 0, f) | 0;j = c[a >> 2] | 0;e = c[j + 8 >> 2] | 0;b = e << 1;d = d + b | 0;b = d + b | 0;qc(a + 36 | 0, 0, ((_((c[j + 4 >> 2] | 0) + 2048 | 0, f) | 0) << 2) + 84 + (f * 96 | 0) + (e << 5) + -36 | 0) | 0;f = 0;
						while (1) {
							if ((f | 0) >= (e << 1 | 0)) {
								b = 24;
								break a
							}
							g[a + 84 + (b + f << 2) >> 2] = -28.0;
							g[a + 84 + (d + f << 2) >> 2] = -28.0;
							e = c[(c[a >> 2] | 0) + 8 >> 2] | 0;
							f = f + 1 | 0
						}
					}
				case 4033:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if (!b) b = 25;
						else {
							c[b >> 2] = c[a + 52 >> 2];
							b = 24
						}
						break
					}
				case 10015:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if (!b) b = 25;
						else {
							c[b >> 2] = c[a >> 2];
							b = 24
						}
						break
					}
				case 10016:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;c[a + 28 >> 2] = b;b = 24;
						break
					}
				case 4031:
					{
						d = (c[f >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[f >> 2] = d + 4;
						if (!b) b = 25;
						else {
							c[b >> 2] = c[a + 36 >> 2];
							b = 24
						}
						break
					}
				default:
					{
						i = h;
						return
					}
			}
			while (0);
			if ((b | 0) == 24) {
				i = h;
				return
			} else
		if ((b | 0) == 25) {
			i = h;
			return
		}
	}

	function Va(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0.0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			$ = 0,
			aa = 0.0;
		$ = i;
		i = i + 8560 | 0;
		v = $ + 8528 | 0;
		u = $ + 8512 | 0;
		z = $ + 8504 | 0;
		A = $ + 4408 | 0;
		Z = $ + 4400 | 0;
		C = $ + 4392 | 0;
		R = $ + 296 | 0;
		Q = $ + 192 | 0;
		S = $ + 96 | 0;
		T = $;
		Y = c[a + 8 >> 2] | 0;
		I = c[a >> 2] | 0;
		p = c[I + 8 >> 2] | 0;
		X = c[I + 4 >> 2] | 0;
		t = c[I + 32 >> 2] | 0;
		h = X + 2048 | 0;
		U = 2048 - d | 0;
		f = 0;
		do {
			G = _(f, h) | 0;
			c[Z + (f << 2) >> 2] = a + 84 + (G << 2);
			c[C + (f << 2) >> 2] = a + 84 + (G + U << 2);
			f = f + 1 | 0
		} while ((f | 0) < (Y | 0));
		P = _(h, Y) | 0;
		h = P + (Y * 24 | 0) | 0;
		m = p << 1;
		m = h + m + m + m | 0;
		V = a + 48 | 0;
		W = c[V >> 2] | 0;
		B = c[a + 20 >> 2] | 0;
		l = (W | 0) > 4;
		if (!((l ^ 1) & (B | 0) == 0)) {
			n = c[a + 24 >> 2] | 0;
			y = c[I + 12 >> 2] | 0;
			G = (n | 0) < (y | 0);
			y = (B | 0) > ((G ? n : y) | 0) ? B : G ? n : y;
			G = _(Y, d) | 0;
			z = na() | 0;
			A = i;
			i = i + ((1 * (G << 2) | 0) + 15 & -16) | 0;
			if (l) h = m;
			else {
				j = (W | 0) == 0 ? 1.5 : .5;
				l = 0;
				do {
					f = _(l, p) | 0;
					m = B;
					while (1) {
						if ((m | 0) >= (n | 0)) break;
						G = a + 84 + (h + (f + m) << 2) | 0;
						g[G >> 2] = +g[G >> 2] - j;
						m = m + 1 | 0
					}
					l = l + 1 | 0
				} while ((l | 0) < (Y | 0))
			}
			x = a + 84 + (h << 2) | 0;
			w = a + 36 | 0;
			h = c[w >> 2] | 0;
			v = 0;
			while (1) {
				if ((v | 0) >= (Y | 0)) break;
				u = _(v, d) | 0;
				m = B;
				a: while (1) {
					if ((m | 0) >= (y | 0)) break;
					p = b[t + (m << 1) >> 1] | 0;
					f = u + (p << e) | 0;
					m = m + 1 | 0;
					p = (b[t + (m << 1) >> 1] | 0) - p << e;
					n = 0;
					while (1) {
						if ((n | 0) >= (p | 0)) break;
						G = (_(h, 1664525) | 0) + 1013904223 | 0;
						g[A + (f + n << 2) >> 2] = +(G >> 20 | 0);
						h = G;
						n = n + 1 | 0
					}
					n = A + (f << 2) | 0;
					l = 0;
					j = 0.0;
					while (1) {
						if ((l | 0) >= (p | 0)) break;
						o = +g[A + (f + l << 2) >> 2];
						l = l + 1 | 0;
						j = j + o * o
					}
					j = 1.0 / +O(+(j + 1.0000000036274937e-15));
					l = 0;
					while (1) {
						if ((l | 0) >= (p | 0)) continue a;
						g[n >> 2] = j * +g[n >> 2];
						l = l + 1 | 0;
						n = n + 4 | 0
					}
				}
				v = v + 1 | 0
			}
			c[w >> 2] = h;
			f = U + (X >>> 1) << 2;
			h = 0;
			do {
				G = c[Z + (h << 2) >> 2] | 0;
				uc(G | 0, G + (d << 2) | 0, f | 0) | 0;
				h = h + 1 | 0
			} while ((h | 0) < (Y | 0));
			Xa(I, A, C, x, B, y, Y, Y, 0, e, c[a + 16 >> 2] | 0, 0);
			va(z | 0);
			G = W + 1 | 0;
			c[V >> 2] = G;
			i = $;
			return
		}
		N = (W | 0) == 0;
		if (N) {
			x = a + 32 | 0;
			t = c[x >> 2] | 0;
			h = 1;
			while (1) {
				if ((h | 0) == 1024) break;
				G = h << 1;
				D = c[Z >> 2] | 0;
				g[A + (h << 2) >> 2] = ((+g[D + (G + -1 << 2) >> 2] + +g[D + ((G | 1) << 2) >> 2]) * .5 + +g[D + (G << 2) >> 2]) * .5;
				h = h + 1 | 0
			}
			G = c[Z >> 2] | 0;
			g[A >> 2] = (+g[G + 4 >> 2] * .5 + +g[G >> 2]) * .5;
			if ((Y | 0) == 2) {
				h = Z + 4 | 0;
				m = 1;
				while (1) {
					if ((m | 0) == 1024) break;
					D = m << 1;
					C = c[h >> 2] | 0;
					G = A + (m << 2) | 0;
					g[G >> 2] = +g[G >> 2] + ((+g[C + (D + -1 << 2) >> 2] + +g[C + ((D | 1) << 2) >> 2]) * .5 + +g[C + (D << 2) >> 2]) * .5;
					m = m + 1 | 0
				}
				G = c[h >> 2] | 0;
				g[A >> 2] = +g[A >> 2] + (+g[G + 4 >> 2] * .5 + +g[G >> 2]) * .5
			}
			lb(A, v, 0, 0, 4, 1024, t);
			g[v >> 2] = +g[v >> 2] * 1.000100016593933;
			h = 1;
			while (1) {
				if ((h | 0) == 5) break;
				G = v + (h << 2) | 0;
				o = +g[G >> 2];
				j = +(h | 0) * .00800000037997961;
				g[G >> 2] = o - o * j * j;
				h = h + 1 | 0
			}
			ib(u, v, 4);
			h = 0;
			j = 1.0;
			while (1) {
				if ((h | 0) == 4) break;
				o = j * .8999999761581421;
				G = u + (h << 2) | 0;
				g[G >> 2] = +g[G >> 2] * o;
				h = h + 1 | 0;
				j = o
			}
			r = +g[u >> 2];
			q = r + .800000011920929;
			s = +g[u + 4 >> 2];
			r = s + r * .800000011920929;
			j = +g[u + 8 >> 2];
			s = j + s * .800000011920929;
			o = +g[u + 12 >> 2];
			j = o + j * .800000011920929;
			o = o * .800000011920929;
			n = 0;
			m = 0;
			l = 0;
			h = 0;
			f = 0;
			p = 0;
			while (1) {
				if ((p | 0) == 1024) break;
				G = A + (p << 2) | 0;
				D = c[G >> 2] | 0;
				aa = (c[k >> 2] = D, +g[k >> 2]);
				aa = aa + q * (c[k >> 2] = n, +g[k >> 2]);
				aa = aa + r * (c[k >> 2] = m, +g[k >> 2]);
				aa = aa + s * (c[k >> 2] = l, +g[k >> 2]);
				aa = aa + j * (c[k >> 2] = h, +g[k >> 2]);
				g[G >> 2] = aa + o * (c[k >> 2] = f, +g[k >> 2]);
				G = n;
				n = D;
				p = p + 1 | 0;
				f = h;
				h = l;
				l = m;
				m = G
			}
			gb(A + 1440 | 0, A, z, t);
			M = 720 - (c[z >> 2] | 0) | 0;
			c[a + 44 >> 2] = M;
			J = x;
			o = 1.0
		} else {
			J = a + 32 | 0;
			o = .800000011920929;
			M = c[a + 44 >> 2] | 0
		}
		K = na() | 0;
		L = i;
		i = i + ((1 * (X << 2) | 0) + 15 & -16) | 0;
		C = c[I + 60 >> 2] | 0;
		e = M << 1;
		B = (e | 0) < 1024;
		y = U << 2;
		l = 1024 - M | 0;
		w = X + d | 0;
		m = 1024 - d + l | 0;
		n = U + -1 | 0;
		p = a + 52 | 0;
		D = a + 60 | 0;
		E = a + 68 | 0;
		F = (X | 0) / 2 | 0;
		G = X + -1 | 0;
		I = 0;
		do {
			A = c[Z + (I << 2) >> 2] | 0;
			H = A;
			v = 0;
			while (1) {
				if ((v | 0) == 1024) break;
				c[R + (v << 2) >> 2] = c[H + (v + 1024 << 2) >> 2];
				v = v + 1 | 0
			}
			if (N) {
				lb(R, Q, C, X, 24, 1024, c[J >> 2] | 0);
				g[Q >> 2] = +g[Q >> 2] * 1.000100016593933;
				v = 1;
				while (1) {
					if ((v | 0) == 25) break;
					z = Q + (v << 2) | 0;
					q = +g[z >> 2];
					j = +(v | 0);
					g[z >> 2] = q - q * 6.400000711437315e-05 * j * j;
					v = v + 1 | 0
				}
				ib(a + 84 + (P + (I * 24 | 0) << 2) | 0, Q, 24)
			}
			t = B ? e : 1024;
			x = 2048 - t + -1 | 0;
			f = 0;
			while (1) {
				if ((f | 0) == 24) break;
				c[S + (f << 2) >> 2] = c[H + (x - f << 2) >> 2];
				f = f + 1 | 0
			}
			h = R + (1024 - t << 2) | 0;
			z = a + 84 + (P + (I * 24 | 0) << 2) | 0;
			jb(h, z, h, t, S, c[J >> 2] | 0);
			h = t >> 1;
			u = 1024 - h | 0;
			x = 1024 - t | 0;
			s = 1.0;
			r = 1.0;
			f = 0;
			while (1) {
				if ((f | 0) >= (h | 0)) break;
				q = +g[R + (u + f << 2) >> 2];
				j = +g[R + (x + f << 2) >> 2];
				s = s + q * q;
				r = r + j * j;
				f = f + 1 | 0
			}
			r = +O(+((s < r ? s : r) / r));
			uc(A | 0, A + (d << 2) | 0, y | 0) | 0;
			q = 0.0;
			s = o * r;
			x = 0;
			f = 0;
			while (1) {
				if ((x | 0) >= (w | 0)) {
					x = 0;
					break
				}
				A = (f | 0) < (M | 0);
				j = A ? s : s * r;
				A = A ? f : f - M | 0;
				g[H + (U + x << 2) >> 2] = j * +g[R + (l + A << 2) >> 2];
				aa = +g[H + (m + A << 2) >> 2];
				q = q + aa * aa;
				s = j;
				x = x + 1 | 0;
				f = A + 1 | 0
			}
			while (1) {
				if ((x | 0) == 24) break;
				c[T + (x << 2) >> 2] = c[H + (n - x << 2) >> 2];
				x = x + 1 | 0
			}
			x = H + (U << 2) | 0;
			kb(x, z, x, w, T, c[J >> 2] | 0);
			s = 0.0;
			x = 0;
			while (1) {
				if ((x | 0) >= (w | 0)) break;
				j = +g[H + (U + x << 2) >> 2];
				s = s + j * j;
				x = x + 1 | 0
			}
			b: do
				if (q > s * .20000000298023224) {
					if (q < s) {
						r = +O(+((q + 1.0) / (s + 1.0)));
						s = 1.0 - r;
						x = 0;
						while (1) {
							if ((x | 0) >= (X | 0)) {
								v = X;
								break
							}
							A = H + (U + x << 2) | 0;
							g[A >> 2] = (1.0 - +g[C + (x << 2) >> 2] * s) * +g[A >> 2];
							x = x + 1 | 0
						}
						while (1) {
							if ((v | 0) >= (w | 0)) break b;
							A = H + (U + v << 2) | 0;
							g[A >> 2] = r * +g[A >> 2];
							v = v + 1 | 0
						}
					}
				} else {
					v = 0;
					while (1) {
						if ((v | 0) >= (w | 0)) break b;
						g[H + (U + v << 2) >> 2] = 0.0;
						v = v + 1 | 0
					}
				}
			while (0);
			A = c[p >> 2] | 0;
			j = - +g[D >> 2];
			v = c[E >> 2] | 0;
			Sa(L, H + 8192 | 0, A, A, X, j, j, v, v, 0, 0, c[J >> 2] | 0);
			v = 0;
			while (1) {
				if ((v | 0) >= (F | 0)) break;
				g[H + (v + 2048 << 2) >> 2] = +g[C + (v << 2) >> 2] * +g[L + (G - v << 2) >> 2] + +g[C + (X - v + -1 << 2) >> 2] * +g[L + (v << 2) >> 2];
				v = v + 1 | 0
			}
			I = I + 1 | 0
		} while ((I | 0) < (Y | 0));
		va(K | 0);
		G = W + 1 | 0;
		c[V >> 2] = G;
		i = $;
		return
	}

	function Wa(a, b, d, e, f, h, j, l) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		var m = 0,
			n = 0,
			o = 0,
			p = 0.0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0.0;
		v = i;
		u = i;
		i = i + ((1 * (d << 2) | 0) + 15 & -16) | 0;
		p = +g[h >> 2];
		q = (d | 0) / (f | 0) | 0;
		r = (f | 0) > 1;
		h = 0;
		s = 0;
		do {
			o = j + (s << 2) | 0;
			l = c[o >> 2] | 0;
			n = c[a + (s << 2) >> 2] | 0;
			if (!r) {
				m = 0;
				while (1) {
					if ((m | 0) >= (d | 0)) break;
					x = +g[n + (m << 2) >> 2] + (c[k >> 2] = l, +g[k >> 2]) + 1.0000000031710769e-30;
					w = (g[k >> 2] = p * x, c[k >> 2] | 0);
					g[b + (s + (_(m, e) | 0) << 2) >> 2] = x * .000030517578125;
					l = w;
					m = m + 1 | 0
				}
				c[o >> 2] = l;
				if (h) t = 9
			} else {
				h = l;
				l = 0;
				while (1) {
					if ((l | 0) >= (d | 0)) break;
					x = +g[n + (l << 2) >> 2] + (c[k >> 2] = h, +g[k >> 2]) + 1.0000000031710769e-30;
					t = (g[k >> 2] = p * x, c[k >> 2] | 0);
					g[u + (l << 2) >> 2] = x;
					h = t;
					l = l + 1 | 0
				}
				c[o >> 2] = h;
				h = 1;
				t = 9
			}
			a: do
				if ((t | 0) == 9) {
					t = 0;
					l = 0;
					while (1) {
						if ((l | 0) >= (q | 0)) break a;
						g[b + (s + (_(l, e) | 0) << 2) >> 2] = +g[u + ((_(l, f) | 0) << 2) >> 2] * .000030517578125;
						l = l + 1 | 0
					}
				}
			while (0);
			s = s + 1 | 0
		} while ((s | 0) < (e | 0));
		i = v;
		return
	}

	function Xa(a, b, d, e, f, h, j, k, l, m, n, o) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0;
		z = i;
		x = c[a + 4 >> 2] | 0;
		r = c[a + 8 >> 2] | 0;
		v = c[a + 44 >> 2] | 0;
		t = v << m;
		y = i;
		i = i + ((1 * (t << 2) | 0) + 15 & -16) | 0;
		s = 1 << m;
		p = (l | 0) == 0;
		u = c[a + 36 >> 2] | 0;
		v = p ? t : v;
		w = p ? 1 : s;
		u = p ? u - m | 0 : u;
		if ((k | 0) == 2) {
			if ((j | 0) == 1) {
				Ia(a, b, y, e, f, h, s, n, o);
				l = d + 4 | 0;
				p = c[l >> 2] | 0;
				j = (x | 0) / 2 | 0;
				tc(p + (j << 2) | 0, y | 0, t << 2 | 0) | 0;
				m = a + 64 | 0;
				k = a + 60 | 0;
				q = 0;
				while (1) {
					if ((q | 0) >= (w | 0)) {
						p = 0;
						break
					}
					a = (c[d >> 2] | 0) + ((_(v, q) | 0) << 2) | 0;
					eb(m, p + (j + q << 2) | 0, a, c[k >> 2] | 0, x, u, w);
					q = q + 1 | 0
				}
				while (1) {
					if ((p | 0) >= (w | 0)) break;
					d = (c[l >> 2] | 0) + ((_(v, p) | 0) << 2) | 0;
					eb(m, y + (p << 2) | 0, d, c[k >> 2] | 0, x, u, w);
					p = p + 1 | 0
				}
				i = z;
				return
			}
		} else if ((k | 0) == 1 & (j | 0) == 2) {
			l = c[d >> 2] | 0;
			m = (x | 0) / 2 | 0;
			Ia(a, b, y, e, f, h, s, n, o);
			Ia(a, b + (t << 2) | 0, l + (m << 2) | 0, e + (r << 2) | 0, f, h, s, n, o);
			q = 0;
			while (1) {
				if ((q | 0) >= (t | 0)) break;
				f = y + (q << 2) | 0;
				g[f >> 2] = (+g[f >> 2] + +g[l + (m + q << 2) >> 2]) * .5;
				q = q + 1 | 0
			}
			q = a + 64 | 0;
			k = a + 60 | 0;
			p = 0;
			while (1) {
				if ((p | 0) >= (w | 0)) break;
				a = (c[d >> 2] | 0) + ((_(v, p) | 0) << 2) | 0;
				eb(q, y + (p << 2) | 0, a, c[k >> 2] | 0, x, u, w);
				p = p + 1 | 0
			}
			i = z;
			return
		}
		l = a + 64 | 0;
		m = a + 60 | 0;
		q = 0;
		do {
			Ia(a, b + ((_(q, t) | 0) << 2) | 0, y, e + ((_(q, r) | 0) << 2) | 0, f, h, s, n, o);
			j = d + (q << 2) | 0;
			p = 0;
			while (1) {
				if ((p | 0) >= (w | 0)) break;
				A = (c[j >> 2] | 0) + ((_(v, p) | 0) << 2) | 0;
				eb(l, y + (p << 2) | 0, A, c[m >> 2] | 0, x, u, w);
				p = p + 1 | 0
			}
			q = q + 1 | 0
		} while ((q | 0) < (k | 0));
		i = z;
		return
	}

	function Ya(a, b, e) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		c[a >> 2] = b;
		c[a + 4 >> 2] = e;
		c[a + 8 >> 2] = 0;
		c[a + 12 >> 2] = 0;
		c[a + 16 >> 2] = 0;
		m = a + 20 | 0;
		c[m >> 2] = 9;
		n = a + 24 | 0;
		c[n >> 2] = 0;
		o = a + 28 | 0;
		c[o >> 2] = 128;
		if (!e) {
			j = a;
			f = 0;
			b = 0
		} else {
			c[n >> 2] = 1;
			j = a;
			f = d[c[a >> 2] >> 0] | 0;
			b = 1
		}
		k = a + 40 | 0;
		c[k >> 2] = f;
		i = f >>> 1 ^ 127;
		l = a + 32 | 0;
		c[l >> 2] = i;
		c[a + 44 >> 2] = 0;
		a = 128;
		g = 9;
		while (1) {
			if (a >>> 0 >= 8388609) break;
			g = g + 8 | 0;
			c[m >> 2] = g;
			a = a << 8;
			c[o >> 2] = a;
			if (b >>> 0 < e >>> 0) {
				p = b + 1 | 0;
				c[n >> 2] = p;
				h = d[(c[j >> 2] | 0) + b >> 0] | 0;
				b = p
			} else h = 0;
			c[k >> 2] = h;
			p = ((f << 8 | h) >>> 1 & 255 | i << 8 & 2147483392) ^ 255;
			c[l >> 2] = p;
			f = h;
			i = p
		}
		return
	}

	function Za(a, b, e) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0;
		h = c[a + 28 >> 2] | 0;
		f = c[a + 32 >> 2] | 0;
		e = h >>> e;
		n = -1;
		while (1) {
			n = n + 1 | 0;
			g = _(e, d[b + n >> 0] | 0) | 0;
			if (f >>> 0 >= g >>> 0) break;
			else h = g
		}
		l = f - g | 0;
		m = a + 32 | 0;
		c[m >> 2] = l;
		h = h - g | 0;
		f = a + 28 | 0;
		c[f >> 2] = h;
		e = a + 20 | 0;
		i = a + 40 | 0;
		j = a + 24 | 0;
		k = a + 4 | 0;
		while (1) {
			if (h >>> 0 >= 8388609) break;
			c[e >> 2] = (c[e >> 2] | 0) + 8;
			h = h << 8;
			c[f >> 2] = h;
			g = c[i >> 2] | 0;
			b = c[j >> 2] | 0;
			if (b >>> 0 < (c[k >> 2] | 0) >>> 0) {
				c[j >> 2] = b + 1;
				b = d[(c[a >> 2] | 0) + b >> 0] | 0
			} else b = 0;
			c[i >> 2] = b;
			b = ((g << 8 | b) >>> 1 & 255 | l << 8 & 2147483392) ^ 255;
			c[m >> 2] = b;
			l = b
		}
		return n | 0
	}

	function _a(a, b) {
		a = a | 0;
		b = b | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		p = b + -1 | 0;
		e = 32 - (aa(p | 0) | 0) | 0;
		if ((e | 0) <= 8) {
			f = ((c[a + 28 >> 2] | 0) >>> 0) / (b >>> 0) | 0;
			c[a + 36 >> 2] = f;
			m = (((c[a + 32 >> 2] | 0) >>> 0) / (f >>> 0) | 0) + 1 | 0;
			m = m >>> 0 > b >>> 0 ? b : m;
			e = b - m | 0;
			f = _(f, b - (e + 1) | 0) | 0;
			n = a + 32 | 0;
			g = (c[n >> 2] | 0) - f | 0;
			c[n >> 2] = g;
			if ((m | 0) == (b | 0)) {
				b = a + 28 | 0;
				m = b;
				b = (c[b >> 2] | 0) - f | 0
			} else {
				m = a + 28 | 0;
				b = c[a + 36 >> 2] | 0
			}
			c[m >> 2] = b;
			i = a + 20 | 0;
			j = a + 40 | 0;
			k = a + 24 | 0;
			l = a + 4 | 0;
			while (1) {
				if (b >>> 0 >= 8388609) break;
				c[i >> 2] = (c[i >> 2] | 0) + 8;
				b = b << 8;
				c[m >> 2] = b;
				h = c[j >> 2] | 0;
				f = c[k >> 2] | 0;
				if (f >>> 0 < (c[l >> 2] | 0) >>> 0) {
					c[k >> 2] = f + 1;
					f = d[(c[a >> 2] | 0) + f >> 0] | 0
				} else f = 0;
				c[j >> 2] = f;
				h = ((h << 8 | f) >>> 1 & 255 | g << 8 & 2147483392) ^ 255;
				c[n >> 2] = h;
				g = h
			}
			return e | 0
		}
		o = e + -8 | 0;
		l = (p >>> o) + 1 | 0;
		f = ((c[a + 28 >> 2] | 0) >>> 0) / (l >>> 0) | 0;
		c[a + 36 >> 2] = f;
		m = (((c[a + 32 >> 2] | 0) >>> 0) / (f >>> 0) | 0) + 1 | 0;
		m = l >>> 0 < m >>> 0 ? l : m;
		e = l - m | 0;
		f = _(f, l - (e + 1) | 0) | 0;
		i = a + 32 | 0;
		h = (c[i >> 2] | 0) - f | 0;
		c[i >> 2] = h;
		if ((l | 0) == (m | 0)) {
			b = a + 28 | 0;
			n = b;
			b = (c[b >> 2] | 0) - f | 0
		} else {
			n = a + 28 | 0;
			b = c[a + 36 >> 2] | 0
		}
		c[n >> 2] = b;
		m = a + 20 | 0;
		l = a + 40 | 0;
		k = a + 24 | 0;
		j = a + 4 | 0;
		while (1) {
			if (b >>> 0 >= 8388609) break;
			c[m >> 2] = (c[m >> 2] | 0) + 8;
			b = b << 8;
			c[n >> 2] = b;
			f = c[l >> 2] | 0;
			g = c[k >> 2] | 0;
			if (g >>> 0 < (c[j >> 2] | 0) >>> 0) {
				c[k >> 2] = g + 1;
				g = d[(c[a >> 2] | 0) + g >> 0] | 0
			} else g = 0;
			c[l >> 2] = g;
			g = ((f << 8 | g) >>> 1 & 255 | h << 8 & 2147483392) ^ 255;
			c[i >> 2] = g;
			h = g
		}
		e = e << o | ($a(a, o) | 0);
		if (e >>> 0 <= p >>> 0) {
			m = e;
			return m | 0
		}
		c[a + 44 >> 2] = 1;
		m = p;
		return m | 0
	}

	function $a(a, b) {
		a = a | 0;
		b = b | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		l = a + 12 | 0;
		e = c[l >> 2] | 0;
		m = a + 16 | 0;
		f = c[m >> 2] | 0;
		if (f >>> 0 < b >>> 0) {
			k = a + 8 | 0;
			i = c[a + 4 >> 2] | 0;
			j = f + (((f + 8 | 0) > 25 ? f + 7 | 0 : 24) - f & -8) | 0;
			g = c[k >> 2] | 0;
			do {
				if (g >>> 0 < i >>> 0) {
					g = g + 1 | 0;
					c[k >> 2] = g;
					h = d[(c[a >> 2] | 0) + (i - g) >> 0] | 0
				} else h = 0;
				e = e | h << f;
				f = f + 8 | 0
			} while ((f | 0) < 25);
			f = j + 8 | 0
		}
		c[l >> 2] = e >>> b;
		c[m >> 2] = f - b;
		m = a + 20 | 0;
		c[m >> 2] = (c[m >> 2] | 0) + b;
		return e & (1 << b) + -1 | 0
	}

	function ab(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0;
		f = a + 28 | 0;
		g = c[f >> 2] | 0;
		h = (g >>> 0) / (e >>> 0) | 0;
		if (!b) {
			g = g - (_(h, e - d | 0) | 0) | 0;
			c[f >> 2] = g;
			db(a);
			return
		} else {
			e = g - (_(h, e - b | 0) | 0) | 0;
			g = a + 32 | 0;
			c[g >> 2] = (c[g >> 2] | 0) + e;
			g = _(h, d - b | 0) | 0;
			c[f >> 2] = g;
			db(a);
			return
		}
	}

	function bb(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0;
		d = c + -1 | 0;
		e = 32 - (aa(d | 0) | 0) | 0;
		if ((e | 0) > 8) {
			e = e + -8 | 0;
			c = b >>> e;
			ab(a, c, c + 1 | 0, (d >>> e) + 1 | 0);
			cb(a, (1 << e) + -1 & b, e);
			return
		} else {
			ab(a, b, b + 1 | 0, c);
			return
		}
	}

	function cb(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		p = b + 12 | 0;
		f = c[p >> 2] | 0;
		q = b + 16 | 0;
		g = c[q >> 2] | 0;
		if ((g + e | 0) >>> 0 > 32) {
			k = b + 24 | 0;
			l = b + 8 | 0;
			m = b + 4 | 0;
			n = b + 44 | 0;
			j = 7 - g | 0;
			j = g + ((j | 0) > -8 ? j : -8) & -8;
			o = g;
			do {
				h = c[l >> 2] | 0;
				i = c[m >> 2] | 0;
				if (((c[k >> 2] | 0) + h | 0) >>> 0 < i >>> 0) {
					h = h + 1 | 0;
					c[l >> 2] = h;
					a[(c[b >> 2] | 0) + (i - h) >> 0] = f;
					h = 0
				} else h = -1;
				c[n >> 2] = c[n >> 2] | h;
				f = f >>> 8;
				o = o + -8 | 0
			} while ((o | 0) > 7);
			g = g + -8 - j | 0
		}
		c[p >> 2] = f | d << g;
		c[q >> 2] = g + e;
		o = b + 20 | 0;
		c[o >> 2] = (c[o >> 2] | 0) + e;
		return
	}

	function db(b) {
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		h = b + 28 | 0;
		i = b + 32 | 0;
		j = b + 36 | 0;
		k = b + 20 | 0;
		l = b + 40 | 0;
		m = b + 24 | 0;
		n = b + 8 | 0;
		o = b + 4 | 0;
		p = b + 44 | 0;
		d = c[h >> 2] | 0;
		while (1) {
			if (d >>> 0 >= 8388609) break;
			d = c[i >> 2] | 0;
			g = d >>> 23;
			if ((g | 0) == 255) c[j >> 2] = (c[j >> 2] | 0) + 1;
			else {
				f = d >>> 31;
				d = c[l >> 2] | 0;
				if ((d | 0) > -1) {
					e = c[m >> 2] | 0;
					if ((e + (c[n >> 2] | 0) | 0) >>> 0 < (c[o >> 2] | 0) >>> 0) {
						c[m >> 2] = e + 1;
						a[(c[b >> 2] | 0) + e >> 0] = d + f;
						d = 0
					} else d = -1;
					c[p >> 2] = c[p >> 2] | d
				}
				e = c[j >> 2] | 0;
				if (e) {
					f = f + 255 & 255;
					do {
						d = c[m >> 2] | 0;
						if ((d + (c[n >> 2] | 0) | 0) >>> 0 < (c[o >> 2] | 0) >>> 0) {
							c[m >> 2] = d + 1;
							a[(c[b >> 2] | 0) + d >> 0] = f;
							e = c[j >> 2] | 0;
							d = 0
						} else d = -1;
						c[p >> 2] = c[p >> 2] | d;
						e = e + -1 | 0;
						c[j >> 2] = e
					} while ((e | 0) != 0)
				}
				c[l >> 2] = g & 255;
				d = c[i >> 2] | 0
			}
			c[i >> 2] = d << 8 & 2147483392;
			d = c[h >> 2] << 8;
			c[h >> 2] = d;
			c[k >> 2] = (c[k >> 2] | 0) + 8
		}
		return
	}

	function eb(a, d, e, f, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0.0,
			x = 0.0,
			y = 0.0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0.0,
			N = 0.0,
			O = 0.0,
			P = 0.0,
			Q = 0.0,
			R = 0.0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			$ = 0,
			aa = 0.0,
			ba = 0.0,
			ca = 0.0,
			da = 0.0,
			ea = 0.0,
			fa = 0.0,
			ga = 0.0,
			ha = 0.0;
		L = i;
		i = i + 48 | 0;
		G = L + 8 | 0;
		H = L;
		n = c[a >> 2] | 0;
		m = 0;
		l = c[a + 24 >> 2] | 0;
		while (1) {
			K = n >> 1;
			if ((m | 0) >= (j | 0)) break;
			n = K;
			m = m + 1 | 0;
			l = l + (K << 2) | 0
		}
		J = n >> 2;
		C = d + ((_(K + -1 | 0, k) | 0) << 2) | 0;
		I = h >> 1;
		m = e + (I << 2) | 0;
		F = c[a + 8 + (j << 2) >> 2] | 0;
		j = k << 1;
		o = 0 - j | 0;
		p = c[F + 44 >> 2] | 0;
		k = 0;
		n = d;
		a = C;
		while (1) {
			if ((k | 0) >= (J | 0)) break;
			C = p;
			w = +g[a >> 2];
			x = +g[l + (k << 2) >> 2];
			y = +g[n >> 2];
			q = +g[l + (J + k << 2) >> 2];
			B = b[C >> 1] << 1;
			g[e + (I + (B | 1) << 2) >> 2] = w * x + y * q;
			g[e + (I + B << 2) >> 2] = y * x - w * q;
			p = C + 2 | 0;
			k = k + 1 | 0;
			n = n + (j << 2) | 0;
			a = a + (o << 2) | 0
		}
		E = m;
		if ((c[F + 8 >> 2] | 0) > 0) D = c[F + 8 >> 2] | 0;
		else D = 0;
		c[G >> 2] = 1;
		a = 0;
		n = 1;
		do {
			B = a << 1;
			C = b[F + 12 + ((B | 1) << 1) >> 1] | 0;
			n = _(n, b[F + 12 + (B << 1) >> 1] | 0) | 0;
			a = a + 1 | 0;
			c[G + (a << 2) >> 2] = n
		} while (C << 16 >> 16 != 1);
		C = F + 48 | 0;
		p = a;
		A = b[F + 12 + ((a << 1) + -1 << 1) >> 1] | 0;
		while (1) {
			k = p + -1 | 0;
			c[H >> 2] = k;
			if ((p | 0) <= 0) break;
			n = k << 1;
			if (!k) B = 1;
			else B = b[F + 12 + (n + -1 << 1) >> 1] | 0;
			a: do switch (b[F + 12 + (n << 1) >> 1] | 0) {
					case 2:
						{
							o = c[G + (k << 2) >> 2] | 0;n = E;p = 0;
							while (1) {
								if ((p | 0) >= (o | 0)) break a;
								A = n;
								v = A + 32 | 0;
								w = +g[v >> 2];
								x = +g[A + 36 >> 2];
								y = +g[A >> 2];
								g[v >> 2] = y - w;
								v = A + 4 | 0;
								q = +g[v >> 2];
								g[A + 36 >> 2] = q - x;
								g[A >> 2] = y + w;
								g[v >> 2] = q + x;
								v = A + 40 | 0;
								x = +g[v >> 2];
								z = A + 44 | 0;
								q = +g[z >> 2];
								w = (x + q) * .7071067690849304;
								x = (q - x) * .7071067690849304;
								u = A + 8 | 0;
								q = +g[u >> 2];
								g[v >> 2] = q - w;
								v = A + 12 | 0;
								y = +g[v >> 2];
								g[z >> 2] = y - x;
								g[u >> 2] = q + w;
								g[v >> 2] = y + x;
								v = A + 52 | 0;
								x = +g[v >> 2];
								u = A + 48 | 0;
								y = +g[u >> 2];
								z = A + 16 | 0;
								w = +g[z >> 2];
								g[u >> 2] = w - x;
								u = A + 20 | 0;
								q = +g[u >> 2];
								g[v >> 2] = q + y;
								g[z >> 2] = w + x;
								g[u >> 2] = q - y;
								u = A + 60 | 0;
								y = +g[u >> 2];
								z = A + 56 | 0;
								q = +g[z >> 2];
								x = (y - q) * .7071067690849304;
								q = (-y - q) * .7071067690849304;
								v = A + 24 | 0;
								y = +g[v >> 2];
								g[z >> 2] = y - x;
								z = A + 28 | 0;
								w = +g[z >> 2];
								g[u >> 2] = w - q;
								g[v >> 2] = y + x;
								g[z >> 2] = w + q;
								n = A + 64 | 0;
								p = p + 1 | 0
							}
						}
					case 4:
						{
							v = c[G + (k << 2) >> 2] | 0;k = v << D;
							if ((A | 0) == 1) {
								n = E;
								k = 0;
								while (1) {
									if ((k | 0) >= (v | 0)) break a;
									A = n;
									q = +g[A >> 2];
									a = A + 16 | 0;
									R = +g[a >> 2];
									y = q - R;
									r = A + 4 | 0;
									N = +g[r >> 2];
									j = A + 20 | 0;
									P = +g[j >> 2];
									w = N - P;
									R = q + R;
									P = N + P;
									s = A + 8 | 0;
									N = +g[s >> 2];
									u = A + 24 | 0;
									q = +g[u >> 2];
									Q = N + q;
									t = A + 12 | 0;
									M = +g[t >> 2];
									z = A + 28 | 0;
									x = +g[z >> 2];
									O = M + x;
									g[a >> 2] = R - Q;
									g[j >> 2] = P - O;
									g[A >> 2] = R + Q;
									g[r >> 2] = P + O;
									q = N - q;
									x = M - x;
									g[s >> 2] = y + x;
									g[t >> 2] = w - q;
									g[u >> 2] = y - x;
									g[z >> 2] = w + q;
									n = A + 32 | 0;
									k = k + 1 | 0
								}
							}
							p = A << 1;o = A * 3 | 0;n = k << 1;a = k * 3 | 0;s = 0;
							while (1) {
								if ((s | 0) >= (v | 0)) break a;
								d = m + ((_(s, B) | 0) << 3) | 0;
								u = c[C >> 2] | 0;
								r = 0;
								j = u;
								t = u;
								while (1) {
									if ((r | 0) >= (A | 0)) break;
									X = d + (A << 3) | 0;
									y = +g[X >> 2];
									T = j;
									O = +g[T >> 2];
									W = d + (A << 3) + 4 | 0;
									R = +g[W >> 2];
									M = +g[T + 4 >> 2];
									P = y * O - R * M;
									O = y * M + R * O;
									$ = d + (p << 3) | 0;
									R = +g[$ >> 2];
									S = t;
									M = +g[S >> 2];
									Z = d + (p << 3) + 4 | 0;
									y = +g[Z >> 2];
									Q = +g[S + 4 >> 2];
									N = R * M - y * Q;
									M = R * Q + y * M;
									V = d + (o << 3) | 0;
									y = +g[V >> 2];
									z = u;
									Q = +g[z >> 2];
									U = d + (o << 3) + 4 | 0;
									R = +g[U >> 2];
									x = +g[z + 4 >> 2];
									q = y * Q - R * x;
									Q = y * x + R * Q;
									R = +g[d >> 2];
									x = R - N;
									Y = d + 4 | 0;
									y = +g[Y >> 2];
									w = y - M;
									N = R + N;
									g[d >> 2] = N;
									M = y + M;
									g[Y >> 2] = M;
									y = P + q;
									R = O + Q;
									q = P - q;
									Q = O - Q;
									g[$ >> 2] = N - y;
									g[Z >> 2] = M - R;
									g[d >> 2] = +g[d >> 2] + y;
									g[Y >> 2] = +g[Y >> 2] + R;
									g[X >> 2] = x + Q;
									g[W >> 2] = w - q;
									g[V >> 2] = x - Q;
									g[U >> 2] = w + q;
									d = d + 8 | 0;
									r = r + 1 | 0;
									j = T + (k << 3) | 0;
									t = S + (n << 3) | 0;
									u = z + (a << 3) | 0
								}
								s = s + 1 | 0
							}
						}
					case 3:
						{
							o = c[G + (k << 2) >> 2] | 0;n = o << D;a = A << 1;j = _(n, A) | 0;q = +g[(c[C >> 2] | 0) + (j << 3) + 4 >> 2];j = n << 1;s = 0;
							while (1) {
								if ((s | 0) >= (o | 0)) break a;
								p = m + ((_(s, B) | 0) << 3) | 0;
								k = c[C >> 2] | 0;
								r = A;
								d = k;
								while (1) {
									v = p + (A << 3) | 0;
									R = +g[v >> 2];
									y = +g[d >> 2];
									z = p + (A << 3) + 4 | 0;
									N = +g[z >> 2];
									Q = +g[d + 4 >> 2];
									M = R * y - N * Q;
									y = R * Q + N * y;
									t = p + (a << 3) | 0;
									N = +g[t >> 2];
									Q = +g[k >> 2];
									u = p + (a << 3) + 4 | 0;
									R = +g[u >> 2];
									x = +g[k + 4 >> 2];
									w = N * Q - R * x;
									Q = N * x + R * Q;
									R = M + w;
									x = y + Q;
									g[v >> 2] = +g[p >> 2] - R * .5;
									Z = p + 4 | 0;
									g[z >> 2] = +g[Z >> 2] - x * .5;
									w = (M - w) * q;
									Q = (y - Q) * q;
									g[p >> 2] = +g[p >> 2] + R;
									g[Z >> 2] = +g[Z >> 2] + x;
									g[t >> 2] = +g[v >> 2] + Q;
									g[u >> 2] = +g[z >> 2] - w;
									g[v >> 2] = +g[v >> 2] - Q;
									g[z >> 2] = +g[z >> 2] + w;
									r = r + -1 | 0;
									if (!r) break;
									else {
										p = p + 8 | 0;
										d = d + (n << 3) | 0;
										k = k + (j << 3) | 0
									}
								}
								s = s + 1 | 0
							}
						}
					case 5:
						{
							v = c[G + (k << 2) >> 2] | 0;u = v << D;s = _(u, A) | 0;t = c[C >> 2] | 0;q = +g[t + (s << 3) >> 2];w = +g[t + (s << 3) + 4 >> 2];s = _(u << 1, A) | 0;x = +g[t + (s << 3) >> 2];y = +g[t + (s << 3) + 4 >> 2];s = A << 1;r = A * 3 | 0;j = A << 2;d = 0;
							while (1) {
								if ((d | 0) >= (v | 0)) break a;
								k = _(d, B) | 0;
								a = m + (k << 3) | 0;
								n = m + (k + A << 3) | 0;
								o = m + (k + s << 3) | 0;
								p = m + (k + r << 3) | 0;
								k = m + (k + j << 3) | 0;
								z = 0;
								while (1) {
									if ((z | 0) >= (A | 0)) break;
									da = +g[a >> 2];
									ba = +g[a + 4 >> 2];
									ca = +g[n >> 2];
									U = _(z, u) | 0;
									N = +g[t + (U << 3) >> 2];
									T = n + 4 | 0;
									ga = +g[T >> 2];
									ha = +g[t + (U << 3) + 4 >> 2];
									R = ca * N - ga * ha;
									N = ca * ha + ga * N;
									ga = +g[o >> 2];
									U = _(z << 1, u) | 0;
									ha = +g[t + (U << 3) >> 2];
									$ = o + 4 | 0;
									ca = +g[$ >> 2];
									P = +g[t + (U << 3) + 4 >> 2];
									fa = ga * ha - ca * P;
									ha = ga * P + ca * ha;
									ca = +g[p >> 2];
									U = _(z * 3 | 0, u) | 0;
									P = +g[t + (U << 3) >> 2];
									Z = p + 4 | 0;
									ga = +g[Z >> 2];
									M = +g[t + (U << 3) + 4 >> 2];
									Q = ca * P - ga * M;
									P = ca * M + ga * P;
									ga = +g[k >> 2];
									U = _(z << 2, u) | 0;
									M = +g[t + (U << 3) >> 2];
									S = k + 4 | 0;
									ca = +g[S >> 2];
									aa = +g[t + (U << 3) + 4 >> 2];
									O = ga * M - ca * aa;
									M = ga * aa + ca * M;
									ca = R + O;
									aa = N + M;
									O = R - O;
									M = N - M;
									N = fa + Q;
									R = ha + P;
									Q = fa - Q;
									P = ha - P;
									g[a >> 2] = +g[a >> 2] + (ca + N);
									U = a + 4 | 0;
									g[U >> 2] = +g[U >> 2] + (aa + R);
									ha = da + ca * q + N * x;
									fa = ba + aa * q + R * x;
									ga = M * w + P * y;
									ea = -(O * w) - Q * y;
									g[n >> 2] = ha - ga;
									g[T >> 2] = fa - ea;
									g[k >> 2] = ha + ga;
									g[S >> 2] = fa + ea;
									N = da + ca * x + N * q;
									R = ba + aa * x + R * q;
									M = P * w - M * y;
									Q = O * y - Q * w;
									g[o >> 2] = N + M;
									g[$ >> 2] = R + Q;
									g[p >> 2] = N - M;
									g[Z >> 2] = R - Q;
									a = a + 8 | 0;
									n = n + 8 | 0;
									o = o + 8 | 0;
									p = p + 8 | 0;
									k = k + 8 | 0;
									z = z + 1 | 0
								}
								d = d + 1 | 0
							}
						}
					default:
						{}
				}
				while (0);
				p = c[H >> 2] | 0;
			A = B
		}
		a = J + 1 >> 1;
		j = 0;
		n = e + (I + K + -2 << 2) | 0;
		while (1) {
			if ((j | 0) >= (a | 0)) break;
			C = m + 4 | 0;
			R = +g[C >> 2];
			N = +g[m >> 2];
			P = +g[l + (j << 2) >> 2];
			y = +g[l + (J + j << 2) >> 2];
			B = n + 4 | 0;
			M = +g[B >> 2];
			O = +g[n >> 2];
			g[m >> 2] = R * P + N * y;
			g[B >> 2] = R * y - N * P;
			P = +g[l + (J - j + -1 << 2) >> 2];
			N = +g[l + (K - j + -1 << 2) >> 2];
			g[n >> 2] = M * P + O * N;
			g[C >> 2] = M * N - O * P;
			j = j + 1 | 0;
			m = m + 8 | 0;
			n = n + -8 | 0
		}
		j = h + -1 | 0;
		a = (h | 0) / 2 | 0;
		m = 0;
		n = f;
		l = f + (j << 2) | 0;
		j = e + (j << 2) | 0;
		while (1) {
			if ((m | 0) >= (a | 0)) break;
			P = +g[j >> 2];
			O = +g[e >> 2];
			g[e >> 2] = +g[l >> 2] * O - +g[n >> 2] * P;
			g[j >> 2] = +g[n >> 2] * O + +g[l >> 2] * P;
			m = m + 1 | 0;
			n = n + 4 | 0;
			l = l + -4 | 0;
			j = j + -4 | 0;
			e = e + 4 | 0
		}
		i = L;
		return
	}

	function fb(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0.0,
			G = 0.0,
			H = 0.0,
			I = 0.0,
			J = 0.0,
			K = 0.0,
			L = 0.0,
			M = 0.0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0.0,
			R = 0.0,
			S = 0.0,
			T = 0.0,
			U = 0.0;
		x = f + -3 | 0;
		y = e + -3 | 0;
		z = (e | 0) > 3 ? e & -4 : 0;
		h = (f + -3 | 0) > 0 ? f & -4 : 0;
		A = b + ((z | 3) << 2) | 0;
		B = 0;
		while (1) {
			if ((B | 0) >= (x | 0)) break;
			w = B | 1;
			u = B | 2;
			v = B | 3;
			o = b + (v << 2) | 0;
			q = a;
			p = 0;
			m = 0;
			l = 0;
			i = 0;
			j = 0;
			n = c[b + (B << 2) >> 2] | 0;
			s = c[b + (w << 2) >> 2] | 0;
			t = c[b + (u << 2) >> 2] | 0;
			r = 0;
			while (1) {
				if ((p | 0) >= (y | 0)) break;
				L = +g[q >> 2];
				r = c[o >> 2] | 0;
				U = (c[k >> 2] = m, +g[k >> 2]);
				U = U + L * (c[k >> 2] = n, +g[k >> 2]);
				T = (c[k >> 2] = l, +g[k >> 2]);
				S = (c[k >> 2] = s, +g[k >> 2]);
				R = (c[k >> 2] = i, +g[k >> 2]);
				Q = (c[k >> 2] = t, +g[k >> 2]);
				M = (c[k >> 2] = j, +g[k >> 2]);
				K = (c[k >> 2] = r, +g[k >> 2]);
				J = +g[q + 4 >> 2];
				E = c[o + 4 >> 2] | 0;
				I = (c[k >> 2] = E, +g[k >> 2]);
				H = +g[q + 8 >> 2];
				D = c[o + 8 >> 2] | 0;
				G = (c[k >> 2] = D, +g[k >> 2]);
				F = +g[q + 12 >> 2];
				C = c[o + 12 >> 2] | 0;
				P = (g[k >> 2] = U + J * S + H * Q + F * K, c[k >> 2] | 0);
				O = (g[k >> 2] = T + L * S + J * Q + H * K + F * I, c[k >> 2] | 0);
				N = (g[k >> 2] = R + L * Q + J * K + H * I + F * G, c[k >> 2] | 0);
				o = o + 16 | 0;
				q = q + 16 | 0;
				p = p + 4 | 0;
				m = P;
				l = O;
				i = N;
				j = (g[k >> 2] = M + L * K + J * I + H * G + F * (c[k >> 2] = C, +g[k >> 2]), c[k >> 2] | 0);
				n = E;
				s = D;
				t = C
			}
			o = z | 1;
			if ((z | 0) < (e | 0)) {
				M = +g[q >> 2];
				r = c[A >> 2] | 0;
				L = (c[k >> 2] = m, +g[k >> 2]);
				m = (g[k >> 2] = L + M * (c[k >> 2] = n, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = l, +g[k >> 2]);
				l = (g[k >> 2] = L + M * (c[k >> 2] = s, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = i, +g[k >> 2]);
				i = (g[k >> 2] = L + M * (c[k >> 2] = t, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = j, +g[k >> 2]);
				p = A + 4 | 0;
				q = q + 4 | 0;
				j = (g[k >> 2] = L + M * (c[k >> 2] = r, +g[k >> 2]), c[k >> 2] | 0)
			} else p = A;
			if ((o | 0) < (e | 0)) {
				M = +g[q >> 2];
				n = c[p >> 2] | 0;
				L = (c[k >> 2] = m, +g[k >> 2]);
				m = (g[k >> 2] = L + M * (c[k >> 2] = s, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = l, +g[k >> 2]);
				l = (g[k >> 2] = L + M * (c[k >> 2] = t, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = i, +g[k >> 2]);
				i = (g[k >> 2] = L + M * (c[k >> 2] = r, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = j, +g[k >> 2]);
				p = p + 4 | 0;
				q = q + 4 | 0;
				j = (g[k >> 2] = L + M * (c[k >> 2] = n, +g[k >> 2]), c[k >> 2] | 0)
			}
			if ((o + 1 | 0) < (e | 0)) {
				M = +g[q >> 2];
				L = (c[k >> 2] = m, +g[k >> 2]);
				m = (g[k >> 2] = L + M * (c[k >> 2] = t, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = l, +g[k >> 2]);
				l = (g[k >> 2] = L + M * (c[k >> 2] = r, +g[k >> 2]), c[k >> 2] | 0);
				L = (c[k >> 2] = i, +g[k >> 2]);
				i = (g[k >> 2] = L + M * (c[k >> 2] = n, +g[k >> 2]), c[k >> 2] | 0);
				j = (g[k >> 2] = (c[k >> 2] = j, +g[k >> 2]) + M * +g[p >> 2], c[k >> 2] | 0)
			}
			c[d + (B << 2) >> 2] = m;
			c[d + (w << 2) >> 2] = l;
			c[d + (u << 2) >> 2] = i;
			c[d + (v << 2) >> 2] = j;
			A = A + 16 | 0;
			B = B + 4 | 0
		}
		while (1) {
			if ((h | 0) < (f | 0)) {
				i = 0;
				j = 0
			} else break;
			while (1) {
				if ((i | 0) >= (e | 0)) break;
				B = (g[k >> 2] = (c[k >> 2] = j, +g[k >> 2]) + +g[a + (i << 2) >> 2] * +g[b + (h + i << 2) >> 2], c[k >> 2] | 0);
				i = i + 1 | 0;
				j = B
			}
			c[d + (h << 2) >> 2] = j;
			h = h + 1 | 0
		}
		return
	}

	function gb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0.0,
			h = 0,
			j = 0.0,
			k = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		q = i;
		i = i + 4528 | 0;
		n = q;
		l = n;
		c[l >> 2] = 0;
		c[l + 4 >> 2] = 0;
		l = q + 3200 | 0;
		m = q + 1248 | 0;
		p = q + 8 | 0;
		h = 0;
		while (1) {
			if ((h | 0) == 332) break;
			c[l + (h << 2) >> 2] = c[a + (h << 1 << 2) >> 2];
			h = h + 1 | 0
		}
		h = 0;
		while (1) {
			if ((h | 0) == 487) break;
			c[m + (h << 2) >> 2] = c[b + (h << 1 << 2) >> 2];
			h = h + 1 | 0
		}
		fb(l, m, p, 332, 155, e);
		hb(p, m, 332, 155, n);
		h = n + 4 | 0;
		m = 0;
		while (1) {
			if ((m | 0) == 310) break;
			l = p + (m << 2) | 0;
			g[l >> 2] = 0.0;
			e = m - (c[n >> 2] << 1) | 0;
			if (!((((e | 0) > -1 ? e : 0 - e | 0) | 0) > 2 ? (e = m - (c[h >> 2] << 1) | 0, (((e | 0) > -1 ? e : 0 - e | 0) | 0) > 2) : 0)) {
				e = 0;
				k = 0.0;
				o = 11
			}
			if ((o | 0) == 11) {
				while (1) {
					o = 0;
					if ((e | 0) == 664) break;
					f = k + +g[a + (e << 2) >> 2] * +g[b + (m + e << 2) >> 2];
					e = e + 1 | 0;
					k = f;
					o = 11
				}
				g[l >> 2] = k < -1.0 ? -1.0 : k
			}
			m = m + 1 | 0
		}
		hb(p, b, 664, 310, n);
		h = c[n >> 2] | 0;
		if (!((h | 0) > 0 & (h | 0) < 309)) {
			p = 0;
			o = h << 1;
			p = o - p | 0;
			c[d >> 2] = p;
			i = q;
			return
		}
		j = +g[p + (h + -1 << 2) >> 2];
		k = +g[p + (h << 2) >> 2];
		f = +g[p + (h + 1 << 2) >> 2];
		if (f - j > (k - j) * .699999988079071) {
			p = 1;
			o = h << 1;
			p = o - p | 0;
			c[d >> 2] = p;
			i = q;
			return
		}
		if (j - f > (k - f) * .699999988079071) {
			p = -1;
			o = h << 1;
			p = o - p | 0;
			c[d >> 2] = p;
			i = q;
			return
		}
		p = 0;
		o = h << 1;
		p = o - p | 0;
		c[d >> 2] = p;
		i = q;
		return
	}

	function hb(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0,
			i = 0,
			j = 0.0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0.0;
		c[f >> 2] = 0;
		u = f + 4 | 0;
		c[u >> 2] = 1;
		i = 1065353216;
		h = 0;
		while (1) {
			if ((h | 0) >= (d | 0)) {
				m = 0;
				r = 0;
				n = 0;
				s = -1082130432;
				q = -1082130432;
				t = 0;
				break
			}
			j = +g[b + (h << 2) >> 2];
			i = (g[k >> 2] = (c[k >> 2] = i, +g[k >> 2]) + j * j, c[k >> 2] | 0);
			h = h + 1 | 0
		}
		while (1) {
			if ((t | 0) >= (e | 0)) break;
			j = +g[a + (t << 2) >> 2];
			do
				if (j > 0.0) {
					j = j * 9.999999960041972e-13;
					j = j * j;
					h = (g[k >> 2] = j, c[k >> 2] | 0);
					w = j * (c[k >> 2] = n, +g[k >> 2]);
					v = (c[k >> 2] = q, +g[k >> 2]);
					l = (c[k >> 2] = i, +g[k >> 2]);
					if (w > v * l) {
						j = j * (c[k >> 2] = r, +g[k >> 2]);
						if (j > (c[k >> 2] = s, +g[k >> 2]) * l) {
							c[u >> 2] = m;
							c[f >> 2] = t;
							m = t;
							o = i;
							n = r;
							p = h;
							h = s;
							break
						} else {
							c[u >> 2] = t;
							o = r;
							n = i;
							p = s;
							break
						}
					} else {
						o = r;
						p = s;
						h = q
					}
				} else {
					l = (c[k >> 2] = i, +g[k >> 2]);
					o = r;
					p = s;
					h = q
				}
			while (0);
			v = +g[b + (t + d << 2) >> 2];
			j = +g[b + (t << 2) >> 2];
			j = l + (v * v - j * j);
			i = (g[k >> 2] = j < 1.0 ? 1.0 : j, c[k >> 2] | 0);
			r = o;
			s = p;
			q = h;
			t = t + 1 | 0
		}
		return
	}

	function ib(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0.0,
			h = 0,
			i = 0.0,
			j = 0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0.0,
			q = 0;
		e = c[b >> 2] | 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (d | 0)) break;
			g[a + (h << 2) >> 2] = 0.0;
			h = h + 1 | 0
		}
		if (+g[b >> 2] != 0.0) m = 0;
		else return;
		while (1) {
			if ((m | 0) < (d | 0)) {
				f = 0.0;
				h = 0
			} else {
				e = 13;
				break
			}
			while (1) {
				if ((m | 0) == (h | 0)) break;
				f = f + +g[a + (h << 2) >> 2] * +g[b + (m - h << 2) >> 2];
				h = h + 1 | 0
			}
			n = m + 1 | 0;
			l = (c[k >> 2] = e, +g[k >> 2]);
			f = (f + +g[b + (n << 2) >> 2]) / l;
			i = -f;
			g[a + (m << 2) >> 2] = i;
			j = n >> 1;
			h = m + -1 | 0;
			e = 0;
			while (1) {
				if ((e | 0) >= (j | 0)) break;
				q = a + (e << 2) | 0;
				o = +g[q >> 2];
				m = a + (h - e << 2) | 0;
				p = +g[m >> 2];
				g[q >> 2] = o + p * i;
				g[m >> 2] = p + o * i;
				e = e + 1 | 0
			}
			f = l - f * f * l;
			if (f < +g[b >> 2] * 1.0000000474974513e-03) {
				e = 13;
				break
			}
			e = (g[k >> 2] = f, c[k >> 2] | 0);
			m = n
		}
		if ((e | 0) == 13) return
	}

	function jb(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0.0;
		q = i;
		i = i + 112 | 0;
		n = q + 96 | 0;
		o = q;
		p = i;
		i = i + ((1 * (e + 24 << 2) | 0) + 15 & -16) | 0;
		j = 0;
		while (1) {
			if ((j | 0) == 24) break;
			c[o + (j << 2) >> 2] = c[b + (24 - j + -1 << 2) >> 2];
			j = j + 1 | 0
		}
		h = 0;
		while (1) {
			if ((h | 0) == 24) {
				h = 0;
				break
			}
			c[p + (h << 2) >> 2] = c[f + (24 - h + -1 << 2) >> 2];
			h = h + 1 | 0
		}
		while (1) {
			if ((h | 0) >= (e | 0)) {
				h = 0;
				break
			}
			c[p + (h + 24 << 2) >> 2] = c[a + (h << 2) >> 2];
			h = h + 1 | 0
		}
		while (1) {
			if ((h | 0) == 24) break;
			c[f + (h << 2) >> 2] = c[a + (e - h + -1 << 2) >> 2];
			h = h + 1 | 0
		}
		b = e + -3 | 0;
		j = n + 4 | 0;
		l = n + 8 | 0;
		m = n + 12 | 0;
		h = (e | 0) > 3 ? e & -4 : 0;
		f = 0;
		while (1) {
			if ((f | 0) >= (b | 0)) break;
			c[n >> 2] = 0;
			c[n + 4 >> 2] = 0;
			c[n + 8 >> 2] = 0;
			c[n + 12 >> 2] = 0;
			mb(o, p + (f << 2) | 0, n, 24);
			g[d + (f << 2) >> 2] = +g[a + (f << 2) >> 2] + +g[n >> 2];
			r = f | 1;
			g[d + (r << 2) >> 2] = +g[a + (r << 2) >> 2] + +g[j >> 2];
			r = f | 2;
			g[d + (r << 2) >> 2] = +g[a + (r << 2) >> 2] + +g[l >> 2];
			r = f | 3;
			g[d + (r << 2) >> 2] = +g[a + (r << 2) >> 2] + +g[m >> 2];
			f = f + 4 | 0
		}
		while (1) {
			if ((h | 0) < (e | 0)) {
				j = 0;
				k = 0.0
			} else break;
			while (1) {
				if ((j | 0) == 24) break;
				s = k + +g[o + (j << 2) >> 2] * +g[p + (h + j << 2) >> 2];
				j = j + 1 | 0;
				k = s
			}
			g[d + (h << 2) >> 2] = +g[a + (h << 2) >> 2] + k;
			h = h + 1 | 0
		}
		i = q;
		return
	}

	function kb(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0.0,
			x = 0.0,
			y = 0.0,
			z = 0,
			A = 0.0,
			B = 0;
		u = i;
		i = i + 112 | 0;
		r = u + 96 | 0;
		s = u;
		j = e + 24 | 0;
		t = i;
		i = i + ((1 * (j << 2) | 0) + 15 & -16) | 0;
		l = 0;
		while (1) {
			if ((l | 0) == 24) break;
			c[s + (l << 2) >> 2] = c[b + (24 - l + -1 << 2) >> 2];
			l = l + 1 | 0
		}
		l = 0;
		while (1) {
			if ((l | 0) == 24) {
				l = 24;
				break
			}
			g[t + (l << 2) >> 2] = - +g[f + (24 - l + -1 << 2) >> 2];
			l = l + 1 | 0
		}
		while (1) {
			if ((l | 0) >= (j | 0)) break;
			g[t + (l << 2) >> 2] = 0.0;
			l = l + 1 | 0
		}
		l = e + -3 | 0;
		j = r + 4 | 0;
		m = r + 8 | 0;
		n = r + 12 | 0;
		o = b + 4 | 0;
		p = b + 8 | 0;
		h = (e + -3 | 0) > 0 ? e & -4 : 0;
		q = 0;
		while (1) {
			if ((q | 0) >= (l | 0)) break;
			c[r >> 2] = c[a + (q << 2) >> 2];
			B = q | 1;
			c[j >> 2] = c[a + (B << 2) >> 2];
			z = q | 2;
			c[m >> 2] = c[a + (z << 2) >> 2];
			v = q | 3;
			c[n >> 2] = c[a + (v << 2) >> 2];
			mb(s, t + (q << 2) | 0, r, 24);
			A = +g[r >> 2];
			w = -A;
			g[t + (q + 24 << 2) >> 2] = w;
			g[d + (q << 2) >> 2] = A;
			A = +g[j >> 2] + +g[b >> 2] * w;
			g[j >> 2] = A;
			x = -A;
			g[t + (q + 25 << 2) >> 2] = x;
			g[d + (B << 2) >> 2] = A;
			A = +g[m >> 2] + +g[b >> 2] * x + +g[o >> 2] * w;
			g[m >> 2] = A;
			y = -A;
			g[t + (q + 26 << 2) >> 2] = y;
			g[d + (z << 2) >> 2] = A;
			w = +g[n >> 2] + +g[b >> 2] * y + +g[o >> 2] * x + +g[p >> 2] * w;
			g[n >> 2] = w;
			g[t + (q + 27 << 2) >> 2] = -w;
			g[d + (v << 2) >> 2] = w;
			q = q + 4 | 0
		}
		while (1) {
			if ((h | 0) >= (e | 0)) {
				h = 0;
				break
			}
			j = 0;
			l = c[a + (h << 2) >> 2] | 0;
			while (1) {
				if ((j | 0) == 24) break;
				b = (g[k >> 2] = (c[k >> 2] = l, +g[k >> 2]) - +g[s + (j << 2) >> 2] * +g[t + (h + j << 2) >> 2], c[k >> 2] | 0);
				j = j + 1 | 0;
				l = b
			}
			c[t + (h + 24 << 2) >> 2] = l;
			c[d + (h << 2) >> 2] = l;
			h = h + 1 | 0
		}
		while (1) {
			if ((h | 0) == 24) break;
			c[f + (h << 2) >> 2] = c[d + (e - h + -1 << 2) >> 2];
			h = h + 1 | 0
		}
		i = u;
		return
	}

	function lb(a, b, d, e, f, h, j) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		var k = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		o = i;
		n = h - f | 0;
		m = i;
		i = i + ((1 * (h << 2) | 0) + 15 & -16) | 0;
		a: do
			if (!e) m = a;
			else {
				l = 0;
				while (1) {
					if ((l | 0) >= (h | 0)) {
						l = 0;
						break
					}
					c[m + (l << 2) >> 2] = c[a + (l << 2) >> 2];
					l = l + 1 | 0
				}
				while (1) {
					if ((l | 0) >= (e | 0)) break a;
					k = +g[d + (l << 2) >> 2];
					g[m + (l << 2) >> 2] = +g[a + (l << 2) >> 2] * k;
					p = h - l + -1 | 0;
					g[m + (p << 2) >> 2] = +g[a + (p << 2) >> 2] * k;
					l = l + 1 | 0
				}
			}
		while (0);
		fb(m, m, b, n, f + 1 | 0, j);
		l = 0;
		while (1) {
			if ((l | 0) > (f | 0)) break;
			k = 0.0;
			e = l + n | 0;
			while (1) {
				if ((e | 0) >= (h | 0)) break;
				k = k + +g[m + (e << 2) >> 2] * +g[m + (e - l << 2) >> 2];
				e = e + 1 | 0
			}
			j = b + (l << 2) | 0;
			g[j >> 2] = +g[j >> 2] + k;
			l = l + 1 | 0
		}
		i = o;
		return
	}

	function mb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			i = 0,
			j = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0.0,
			z = 0.0,
			A = 0.0,
			B = 0.0,
			C = 0.0,
			D = 0.0,
			E = 0.0;
		j = e + -3 | 0;
		r = d + 4 | 0;
		s = d + 8 | 0;
		t = d + 12 | 0;
		o = (e | 0) > 3 ? e & -4 : 0;
		n = o | 3;
		i = a;
		h = b + 12 | 0;
		l = 0;
		f = c[b >> 2] | 0;
		q = c[b + 4 >> 2] | 0;
		u = c[b + 8 >> 2] | 0;
		m = 0;
		while (1) {
			if ((l | 0) >= (j | 0)) break;
			y = +g[i >> 2];
			m = c[h >> 2] | 0;
			B = +g[d >> 2] + y * (c[k >> 2] = f, +g[k >> 2]);
			g[d >> 2] = B;
			z = (c[k >> 2] = q, +g[k >> 2]);
			C = +g[r >> 2] + y * z;
			g[r >> 2] = C;
			E = (c[k >> 2] = u, +g[k >> 2]);
			A = +g[s >> 2] + y * E;
			g[s >> 2] = A;
			D = (c[k >> 2] = m, +g[k >> 2]);
			y = +g[t >> 2] + y * D;
			g[t >> 2] = y;
			x = +g[i + 4 >> 2];
			w = c[h + 4 >> 2] | 0;
			z = B + x * z;
			g[d >> 2] = z;
			C = C + x * E;
			g[r >> 2] = C;
			A = A + x * D;
			g[s >> 2] = A;
			B = (c[k >> 2] = w, +g[k >> 2]);
			x = y + x * B;
			g[t >> 2] = x;
			y = +g[i + 8 >> 2];
			v = c[h + 8 >> 2] | 0;
			E = z + y * E;
			g[d >> 2] = E;
			C = C + y * D;
			g[r >> 2] = C;
			A = A + y * B;
			g[s >> 2] = A;
			z = (c[k >> 2] = v, +g[k >> 2]);
			y = x + y * z;
			g[t >> 2] = y;
			x = +g[i + 12 >> 2];
			p = c[h + 12 >> 2] | 0;
			g[d >> 2] = E + x * D;
			g[r >> 2] = C + x * B;
			g[s >> 2] = A + x * z;
			g[t >> 2] = y + x * (c[k >> 2] = p, +g[k >> 2]);
			i = i + 16 | 0;
			h = h + 16 | 0;
			l = l + 4 | 0;
			f = w;
			q = v;
			u = p
		}
		i = a + (o << 2) | 0;
		h = b + (n << 2) | 0;
		p = o | 1;
		if ((o | 0) < (e | 0)) {
			x = +g[i >> 2];
			l = n + 1 | 0;
			m = c[h >> 2] | 0;
			g[d >> 2] = +g[d >> 2] + x * (c[k >> 2] = f, +g[k >> 2]);
			g[r >> 2] = +g[r >> 2] + x * (c[k >> 2] = q, +g[k >> 2]);
			g[s >> 2] = +g[s >> 2] + x * (c[k >> 2] = u, +g[k >> 2]);
			g[t >> 2] = +g[t >> 2] + x * (c[k >> 2] = m, +g[k >> 2]);
			i = a + (p << 2) | 0;
			h = b + (l << 2) | 0;
			j = p
		} else {
			l = n;
			j = o
		}
		if ((p | 0) < (e | 0)) {
			x = +g[i >> 2];
			f = c[h >> 2] | 0;
			g[d >> 2] = +g[d >> 2] + x * (c[k >> 2] = q, +g[k >> 2]);
			g[r >> 2] = +g[r >> 2] + x * (c[k >> 2] = u, +g[k >> 2]);
			g[s >> 2] = +g[s >> 2] + x * (c[k >> 2] = m, +g[k >> 2]);
			g[t >> 2] = +g[t >> 2] + x * (c[k >> 2] = f, +g[k >> 2]);
			i = a + (j + 1 << 2) | 0;
			h = b + (l + 1 << 2) | 0
		}
		if ((p + 1 | 0) >= (e | 0)) return;
		y = +g[i >> 2];
		x = +g[h >> 2];
		g[d >> 2] = +g[d >> 2] + y * (c[k >> 2] = u, +g[k >> 2]);
		g[r >> 2] = +g[r >> 2] + y * (c[k >> 2] = m, +g[k >> 2]);
		g[s >> 2] = +g[s >> 2] + y * (c[k >> 2] = f, +g[k >> 2]);
		g[t >> 2] = +g[t >> 2] + y * x;
		return
	}

	function nb(a, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		var u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0;
		Y = i;
		m = (m | 0) > 0 ? m : 0;
		B = c[a + 8 >> 2] | 0;
		R = (m | 0) > 7 ? 8 : 0;
		m = m - R | 0;
		X = (r | 0) == 2;
		if (X ? (v = d[23686 + (f - e) >> 0] | 0, (m | 0) >= (v | 0)) : 0) {
			m = m - v | 0;
			S = (m | 0) > 7 ? 8 : 0;
			m = m - S | 0
		} else {
			S = 0;
			v = 0
		}
		L = i;
		i = i + ((1 * (B << 2) | 0) + 15 & -16) | 0;
		K = i;
		i = i + ((1 * (B << 2) | 0) + 15 & -16) | 0;
		Q = i;
		i = i + ((1 * (B << 2) | 0) + 15 & -16) | 0;
		I = i;
		i = i + ((1 * (B << 2) | 0) + 15 & -16) | 0;
		V = r << 3;
		W = a + 32 | 0;
		w = j + -5 - s | 0;
		j = s + 3 | 0;
		z = e;
		while (1) {
			if ((z | 0) >= (f | 0)) break;
			u = z + 1 | 0;
			x = c[W >> 2] | 0;
			x = ((b[x + (u << 1) >> 1] | 0) - (b[x + (z << 1) >> 1] | 0) | 0) * 3 << s << 3 >> 4;
			c[Q + (z << 2) >> 2] = (V | 0) > (x | 0) ? V : x;
			x = c[W >> 2] | 0;
			x = (_(_(_((b[x + (u << 1) >> 1] | 0) - (b[x + (z << 1) >> 1] | 0) | 0, r) | 0, w) | 0, f - z + -1 | 0) | 0) << j >> 6;
			y = I + (z << 2) | 0;
			c[y >> 2] = x;
			T = c[W >> 2] | 0;
			if (((b[T + (u << 1) >> 1] | 0) - (b[T + (z << 1) >> 1] | 0) << s | 0) != 1) {
				z = u;
				continue
			}
			c[y >> 2] = x - V;
			z = u
		}
		u = a + 48 | 0;
		G = a + 52 | 0;
		C = (c[u >> 2] | 0) + -1 | 0;
		H = 1;
		do {
			F = H + C >> 1;
			E = _(F, B) | 0;
			D = 1;
			z = f;
			y = 0;
			a: while (1) {
				b: while (1) {
					A = z;
					do {
						z = A;
						A = A + -1 | 0;
						if ((z | 0) <= (e | 0)) break a;
						T = c[W >> 2] | 0;
						z = _((b[T + (z << 1) >> 1] | 0) - (b[T + (A << 1) >> 1] | 0) | 0, r) | 0;
						z = (_(z, d[(c[G >> 2] | 0) + (E + A) >> 0] | 0) | 0) << s >> 2;
						if ((z | 0) > 0) {
							z = z + (c[I + (A << 2) >> 2] | 0) | 0;
							z = (z | 0) < 0 ? 0 : z
						}
						x = z + (c[g + (A << 2) >> 2] | 0) | 0;
						if ((x | 0) < (c[Q + (A << 2) >> 2] | 0) ^ 1 | D ^ 1) break b
					} while ((x | 0) < (V | 0));
					z = A;
					y = y + V | 0
				}
				T = c[h + (A << 2) >> 2] | 0;D = 0;z = A;y = y + ((x | 0) < (T | 0) ? x : T) | 0
			}
			T = (y | 0) > (m | 0);
			H = T ? H : F + 1 | 0;
			C = T ? F + -1 | 0 : C
		} while ((H | 0) <= (C | 0));
		E = _(H + -1 | 0, B) | 0;
		x = _(H, B) | 0;
		w = (H | 0) > 1;
		M = e;
		D = e;
		while (1) {
			if ((D | 0) >= (f | 0)) break;
			j = D + 1 | 0;
			z = c[W >> 2] | 0;
			z = _((b[z + (j << 1) >> 1] | 0) - (b[z + (D << 1) >> 1] | 0) | 0, r) | 0;
			y = c[G >> 2] | 0;
			A = (_(z, d[y + (E + D) >> 0] | 0) | 0) << s >> 2;
			if ((H | 0) < (c[u >> 2] | 0)) z = (_(z, d[y + (x + D) >> 0] | 0) | 0) << s >> 2;
			else z = c[h + (D << 2) >> 2] | 0;
			if ((A | 0) > 0) {
				y = A + (c[I + (D << 2) >> 2] | 0) | 0;
				y = (y | 0) < 0 ? 0 : y
			} else y = A;
			if ((z | 0) > 0) {
				z = z + (c[I + (D << 2) >> 2] | 0) | 0;
				z = (z | 0) < 0 ? 0 : z
			}
			T = c[g + (D << 2) >> 2] | 0;
			P = w ? y + T | 0 : y;
			O = z + T | 0;
			c[L + (D << 2) >> 2] = P;
			c[K + (D << 2) >> 2] = (O | 0) < (P | 0) ? 0 : O - P | 0;
			M = (T | 0) > 0 ? D : M;
			D = j
		}
		N = (r | 0) > 1;
		T = N & 1;
		u = 64;
		F = 0;
		A = 0;
		while (1) {
			if ((A | 0) == 6) break;
			w = F + u >> 1;
			j = 1;
			z = f;
			y = 0;
			c: while (1) {
				d: while (1) {
					do {
						P = z;
						z = z + -1 | 0;
						if ((P | 0) <= (e | 0)) break c;
						x = (c[L + (z << 2) >> 2] | 0) + ((_(w, c[K + (z << 2) >> 2] | 0) | 0) >> 6) | 0;
						if ((x | 0) < (c[Q + (z << 2) >> 2] | 0) ^ 1 | j ^ 1) break d
					} while ((x | 0) < (V | 0));
					y = y + V | 0
				}
				P = c[h + (z << 2) >> 2] | 0;j = 0;y = y + ((x | 0) < (P | 0) ? x : P) | 0
			}
			P = (y | 0) > (m | 0);
			u = P ? w : u;
			F = P ? F : w;
			A = A + 1 | 0
		}
		P = s << 3;
		y = 0;
		x = f;
		D = 0;
		while (1) {
			w = x + -1 | 0;
			if ((x | 0) <= (e | 0)) break;
			B = (c[L + (w << 2) >> 2] | 0) + ((_(F, c[K + (w << 2) >> 2] | 0) | 0) >> 6) | 0;
			x = (y | 0) == 0 ? (B | 0) < (c[Q + (w << 2) >> 2] | 0) : 0;
			B = x ? ((B | 0) < (V | 0) ? 0 : V) : B;
			O = c[h + (w << 2) >> 2] | 0;
			O = (B | 0) < (O | 0) ? B : O;
			c[o + (w << 2) >> 2] = O;
			y = x ? 0 : 1;
			x = w;
			D = D + O | 0
		}
		H = V + 8 | 0;
		G = t + 28 | 0;
		y = t + 32 | 0;
		g = t + 28 | 0;
		I = t + 20 | 0;
		B = t + 40 | 0;
		J = t + 24 | 0;
		K = t + 4 | 0;
		L = t + 32 | 0;
		O = f;
		while (1) {
			w = O + -1 | 0;
			if ((w | 0) <= (M | 0)) {
				U = 46;
				break
			}
			A = m - D | 0;
			z = c[W >> 2] | 0;
			j = b[z + (O << 1) >> 1] | 0;
			F = b[z + (e << 1) >> 1] | 0;
			x = j - F | 0;
			u = (A >>> 0) / (x >>> 0) | 0;
			x = A - (_(x, u) | 0) | 0;
			z = b[z + (w << 1) >> 1] | 0;
			F = x + (F - z) | 0;
			x = o + (w << 2) | 0;
			A = c[x >> 2] | 0;
			F = A + (_(u, j - z | 0) | 0) + ((F | 0) > 0 ? F : 0) | 0;
			z = c[Q + (w << 2) >> 2] | 0;
			if ((F | 0) < (((z | 0) > (H | 0) ? z : H) | 0)) E = A;
			else {
				C = c[G >> 2] | 0;
				u = c[y >> 2] | 0;
				E = C >>> 1;
				j = u >>> 0 < E >>> 0;
				if (!j) {
					c[L >> 2] = u - E;
					E = C - E | 0
				}
				c[g >> 2] = E;
				while (1) {
					if (E >>> 0 >= 8388609) break;
					c[I >> 2] = (c[I >> 2] | 0) + 8;
					E = E << 8;
					c[g >> 2] = E;
					u = c[B >> 2] | 0;
					C = c[J >> 2] | 0;
					if (C >>> 0 < (c[K >> 2] | 0) >>> 0) {
						c[J >> 2] = C + 1;
						C = d[(c[t >> 2] | 0) + C >> 0] | 0
					} else C = 0;
					c[B >> 2] = C;
					c[L >> 2] = ((u << 8 | C) >>> 1 & 255 | c[L >> 2] << 8 & 2147483392) ^ 255
				}
				if (j) break;
				E = c[x >> 2] | 0;
				F = F + -8 | 0;
				D = D + 8 | 0
			}
			if ((v | 0) > 0) A = d[23686 + (w - e) >> 0] | 0;
			else A = v;
			D = D - (E + v) + A | 0;
			O = (F | 0) < (V | 0);
			c[x >> 2] = O ? 0 : V;
			v = A;
			D = O ? D : D + V | 0;
			O = w
		}
		if ((U | 0) == 46) m = m + R | 0;
		if ((v | 0) > 0) c[k >> 2] = (_a(t, O + 1 - e | 0) | 0) + e;
		else c[k >> 2] = 0;
		if ((c[k >> 2] | 0) > (e | 0))
			if (!S) U = 74;
			else {
				z = c[G >> 2] | 0;
				w = c[y >> 2] | 0;
				v = z >>> 1;
				S = w >>> 0 < v >>> 0;
				A = S & 1;
				if (!S) {
					c[L >> 2] = w - v;
					v = z - v | 0
				}
				c[g >> 2] = v;
				while (1) {
					if (v >>> 0 >= 8388609) break;
					c[I >> 2] = (c[I >> 2] | 0) + 8;
					v = v << 8;
					c[g >> 2] = v;
					z = c[B >> 2] | 0;
					w = c[J >> 2] | 0;
					if (w >>> 0 < (c[K >> 2] | 0) >>> 0) {
						c[J >> 2] = w + 1;
						w = d[(c[t >> 2] | 0) + w >> 0] | 0
					} else w = 0;
					c[B >> 2] = w;
					c[L >> 2] = ((z << 8 | w) >>> 1 & 255 | c[L >> 2] << 8 & 2147483392) ^ 255
				}
				c[l >> 2] = A
			}
		else {
			m = m + S | 0;
			U = 74
		}
		if ((U | 0) == 74) c[l >> 2] = 0;
		u = m - D | 0;
		j = c[W >> 2] | 0;
		j = (b[j + (O << 1) >> 1] | 0) - (b[j + (e << 1) >> 1] | 0) | 0;
		m = (u >>> 0) / (j >>> 0) | 0;
		j = _(j, m) | 0;
		v = e;
		while (1) {
			if ((v | 0) >= (O | 0)) break;
			U = v + 1 | 0;
			S = c[W >> 2] | 0;
			S = _(m, (b[S + (U << 1) >> 1] | 0) - (b[S + (v << 1) >> 1] | 0) | 0) | 0;
			t = o + (v << 2) | 0;
			c[t >> 2] = (c[t >> 2] | 0) + S;
			v = U
		}
		m = u - j | 0;
		u = e;
		while (1) {
			if ((u | 0) >= (O | 0)) break;
			U = u + 1 | 0;
			t = c[W >> 2] | 0;
			t = (b[t + (U << 1) >> 1] | 0) - (b[t + (u << 1) >> 1] | 0) | 0;
			t = (m | 0) < (t | 0) ? m : t;
			S = o + (u << 2) | 0;
			c[S >> 2] = (c[S >> 2] | 0) + t;
			m = m - t | 0;
			u = U
		}
		F = a + 56 | 0;
		x = N ? 4 : 3;
		B = (O | 0) > (e | 0);
		D = 0;
		E = e;
		while (1) {
			if ((E | 0) >= (O | 0)) break;
			C = E + 1 | 0;
			w = c[W >> 2] | 0;
			w = (b[w + (C << 1) >> 1] | 0) - (b[w + (E << 1) >> 1] | 0) << s;
			A = o + (E << 2) | 0;
			j = (c[A >> 2] | 0) + D | 0;
			if ((w | 0) > 1) {
				v = c[h + (E << 2) >> 2] | 0;
				v = (j | 0) > (v | 0) ? j - v | 0 : 0;
				z = j - v | 0;
				c[A >> 2] = z;
				j = _(w, r) | 0;
				if (X & (w | 0) > 2 ? (c[l >> 2] | 0) == 0 : 0) u = (E | 0) < (c[k >> 2] | 0);
				else u = 0;
				y = j + (u & 1) | 0;
				m = _(y, (b[(c[F >> 2] | 0) + (E << 1) >> 1] | 0) + P | 0) | 0;
				j = (m >> 1) + (_(y, -21) | 0) | 0;
				if ((w | 0) == 2) j = j + (y << 3 >> 2) | 0;
				u = z + j | 0;
				if ((u | 0) >= (y << 4 | 0))
					if ((u | 0) < (y * 24 | 0)) w = j + (m >> 3) | 0;
					else w = j;
				else w = j + (m >> 2) | 0;
				j = z + w + (y << 2) | 0;
				m = p + (E << 2) | 0;
				j = ((((j | 0) < 0 ? 0 : j) >>> 0) / (y >>> 0) | 0) >>> 3;
				c[m >> 2] = j;
				a = _(j, r) | 0;
				u = c[A >> 2] | 0;
				if ((a | 0) > (u >> 3 | 0)) {
					j = u >> T >> 3;
					c[m >> 2] = j
				}
				a = (j | 0) < 8 ? j : 8;
				c[m >> 2] = a;
				a = _(a, y << 3) | 0;
				c[q + (E << 2) >> 2] = (a | 0) >= ((c[A >> 2] | 0) + w | 0) & 1;
				a = (_(c[m >> 2] | 0, r) | 0) << 3;
				c[A >> 2] = (c[A >> 2] | 0) - a
			} else {
				v = (j | 0) < (V | 0) ? 0 : j - V | 0;
				c[A >> 2] = j - v;
				c[p + (E << 2) >> 2] = 0;
				c[q + (E << 2) >> 2] = 1
			}
			if ((v | 0) <= 0) {
				D = v;
				E = C;
				continue
			}
			S = v >> x;
			U = p + (E << 2) | 0;
			t = c[U >> 2] | 0;
			a = 8 - t | 0;
			a = (S | 0) < (a | 0) ? S : a;
			c[U >> 2] = t + a;
			a = (_(a, r) | 0) << 3;
			c[q + (E << 2) >> 2] = (a | 0) >= (v - D | 0) & 1;
			D = v - a | 0;
			E = C
		}
		c[n >> 2] = D;
		m = B ? O : e;
		while (1) {
			if ((m | 0) >= (f | 0)) break;
			k = o + (m << 2) | 0;
			e = p + (m << 2) | 0;
			c[e >> 2] = c[k >> 2] >> T >> 3;
			c[k >> 2] = 0;
			c[q + (m << 2) >> 2] = (c[e >> 2] | 0) < 1 & 1;
			m = m + 1 | 0
		}
		i = Y;
		return O | 0
	}

	function ob(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0.0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0.0,
			z = 0.0;
		x = i;
		u = i;
		i = i + ((1 * (b << 2) | 0) + 15 & -16) | 0;
		w = i;
		i = i + ((1 * (b << 2) | 0) + 15 & -16) | 0;
		v = i;
		i = i + ((1 * (b << 2) | 0) + 15 & -16) | 0;
		qb(a, b, 1, f, d, e);
		l = 0;
		do {
			e = a + (l << 2) | 0;
			j = +g[e >> 2];
			if (j > 0.0) j = 1.0;
			else {
				g[e >> 2] = -j;
				j = -1.0
			}
			g[v + (l << 2) >> 2] = j;
			c[w + (l << 2) >> 2] = 0;
			g[u + (l << 2) >> 2] = 0.0;
			l = l + 1 | 0
		} while ((l | 0) < (b | 0));
		if ((b >> 1 | 0) < (d | 0)) {
			e = 0;
			j = 0.0;
			do {
				j = j + +g[a + (e << 2) >> 2];
				e = e + 1 | 0
			} while ((e | 0) < (b | 0));
			if (!(j > 1.0000000036274937e-15 & j < 64.0)) {
				g[a >> 2] = 1.0;
				e = 1;
				do {
					g[a + (e << 2) >> 2] = 0.0;
					e = e + 1 | 0
				} while ((e | 0) < (b | 0));
				j = 1.0
			}
			q = +(d + -1 | 0) * (1.0 / j);
			n = 0;
			o = d;
			p = 0.0;
			j = 0.0;
			do {
				z = +g[a + (n << 2) >> 2];
				t = ~~+M(+(q * z));
				c[w + (n << 2) >> 2] = t;
				y = +(t | 0);
				j = j + y * y;
				p = p + z * y;
				g[u + (n << 2) >> 2] = y * 2.0;
				o = o - t | 0;
				n = n + 1 | 0
			} while ((n | 0) < (b | 0))
		} else {
			o = d;
			p = 0.0;
			j = 0.0
		}
		if ((o | 0) > (b + 3 | 0)) {
			q = +(o | 0);
			j = j + q * q + q * +g[u >> 2];
			c[w >> 2] = (c[w >> 2] | 0) + o;
			o = 0
		}
		t = 0;
		while (1) {
			if ((t | 0) >= (o | 0)) {
				e = 0;
				break
			}
			q = j + 1.0;
			l = 0;
			e = 0;
			r = -664576087;
			s = 0;
			while (1) {
				y = p + +g[a + (s << 2) >> 2];
				j = q + +g[u + (s << 2) >> 2];
				y = y * y;
				z = (c[k >> 2] = l, +g[k >> 2]) * y;
				n = z > j * (c[k >> 2] = r, +g[k >> 2]);
				m = (g[k >> 2] = y, c[k >> 2] | 0);
				e = n ? s : e;
				s = s + 1 | 0;
				if ((s | 0) >= (b | 0)) break;
				else {
					l = n ? (g[k >> 2] = j, c[k >> 2] | 0) : l;
					r = n ? m : r
				}
			}
			y = p + +g[a + (e << 2) >> 2];
			s = u + (e << 2) | 0;
			j = +g[s >> 2];
			g[s >> 2] = j + 2.0;
			s = w + (e << 2) | 0;
			c[s >> 2] = (c[s >> 2] | 0) + 1;
			t = t + 1 | 0;
			p = y;
			j = q + j
		}
		do {
			j = +g[v + (e << 2) >> 2];
			t = a + (e << 2) | 0;
			g[t >> 2] = j * +g[t >> 2];
			if (j < 0.0) {
				t = w + (e << 2) | 0;
				c[t >> 2] = 0 - (c[t >> 2] | 0)
			}
			e = e + 1 | 0
		} while ((e | 0) < (b | 0));
		m = b + -1 | 0;
		o = c[w + (m << 2) >> 2] | 0;
		e = o >>> 31;
		o = (o | 0) > -1 ? o : 0 - o | 0;
		do {
			n = m;
			m = m + -1 | 0;
			l = b - m | 0;
			e = e + (c[(c[1572 + (((l | 0) < (o | 0) ? l : o) << 2) >> 2] | 0) + (((l | 0) > (o | 0) ? l : o) << 2) >> 2] | 0) | 0;
			v = c[w + (m << 2) >> 2] | 0;
			o = o + ((v | 0) > -1 ? v : 0 - v | 0) | 0;
			if ((v | 0) < 0) {
				v = o + 1 | 0;
				e = e + (c[(c[1572 + (((l | 0) < (v | 0) ? l : v) << 2) >> 2] | 0) + (((l | 0) > (v | 0) ? l : v) << 2) >> 2] | 0) | 0
			}
		} while ((n | 0) > 1);
		v = d + 1 | 0;
		bb(h, e, (c[(c[1572 + (((b | 0) < (d | 0) ? b : d) << 2) >> 2] | 0) + (((b | 0) > (d | 0) ? b : d) << 2) >> 2] | 0) + (c[(c[1572 + (((d | 0) < (b | 0) ? v : b) << 2) >> 2] | 0) + (((v | 0) < (b | 0) ? b : v) << 2) >> 2] | 0) | 0);
		v = rb(w, b, f) | 0;
		i = x;
		return v | 0
	}

	function pb(a, b, d, e, f, h, j) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = +j;
		var k = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0.0,
			v = 0.0;
		t = i;
		s = i;
		i = i + ((1 * (b << 2) | 0) + 15 & -16) | 0;
		o = d + 1 | 0;
		p = b;
		q = d;
		o = _a(h, (c[(c[1572 + (((b | 0) < (d | 0) ? b : d) << 2) >> 2] | 0) + (((b | 0) > (d | 0) ? b : d) << 2) >> 2] | 0) + (c[(c[1572 + (((d | 0) < (b | 0) ? o : b) << 2) >> 2] | 0) + (((o | 0) < (b | 0) ? b : o) << 2) >> 2] | 0) | 0) | 0;
		r = s;
		k = 0.0;
		while (1) {
			if ((p | 0) <= 2) break;
			do
				if ((q | 0) < (p | 0)) {
					h = c[(c[1572 + (q << 2) >> 2] | 0) + (p << 2) >> 2] | 0;
					l = c[(c[1572 + (q + 1 << 2) >> 2] | 0) + (p << 2) >> 2] | 0;
					if (o >>> 0 >= h >>> 0 & o >>> 0 < l >>> 0) {
						c[r >> 2] = 0;
						m = o - h | 0;
						h = q;
						break
					}
					n = o >>> 0 >= l >>> 0;
					l = o - (n ? l : 0) | 0;
					h = q;
					do {
						h = h + -1 | 0;
						m = c[(c[1572 + (h << 2) >> 2] | 0) + (p << 2) >> 2] | 0
					} while (l >>> 0 < m >>> 0);
					o = n << 31 >> 31;
					q = q - h + o ^ o;
					c[r >> 2] = q << 16 >> 16;
					u = +((q & 65535) << 16 >> 16);
					m = l - m | 0;
					k = k + u * u
				} else {
					l = c[1572 + (p << 2) >> 2] | 0;
					m = c[l + (q + 1 << 2) >> 2] | 0;
					h = o >>> 0 >= m >>> 0;
					n = h << 31 >> 31;
					o = o - (h ? m : 0) | 0;
					a: do
						if ((c[l + (p << 2) >> 2] | 0) >>> 0 > o >>> 0) {
							h = p;
							do {
								h = h + -1 | 0;
								m = c[(c[1572 + (h << 2) >> 2] | 0) + (p << 2) >> 2] | 0
							} while (m >>> 0 > o >>> 0)
						} else {
							h = q;
							while (1) {
								m = c[l + (h << 2) >> 2] | 0;
								if (m >>> 0 <= o >>> 0) break a;
								h = h + -1 | 0
							}
						}
					while (0);
					q = q - h + n ^ n;
					c[r >> 2] = q << 16 >> 16;
					u = +((q & 65535) << 16 >> 16);
					m = o - m | 0;
					k = k + u * u
				}
			while (0);
			p = p + -1 | 0;
			q = h;
			o = m;
			r = r + 4 | 0
		}
		h = q << 1 | 1;
		l = o >>> 0 >= h >>> 0;
		m = l << 31 >> 31;
		h = o - (l ? h : 0) | 0;
		l = (h + 1 | 0) >>> 1;
		if (l) h = h - ((l << 1) + -1) | 0;
		q = q - l + m ^ m;
		c[r >> 2] = q << 16 >> 16;
		v = +((q & 65535) << 16 >> 16);
		h = l - h ^ 0 - h;
		c[r + 4 >> 2] = h << 16 >> 16;
		u = +((h & 65535) << 16 >> 16);
		k = 1.0 / +O(+(k + v * v + u * u)) * j;
		h = 0;
		do {
			g[a + (h << 2) >> 2] = k * +(c[s + (h << 2) >> 2] | 0);
			h = h + 1 | 0
		} while ((h | 0) < (b | 0));
		qb(a, b, -1, f, d, e);
		f = rb(s, b, f) | 0;
		i = t;
		return f | 0
	}

	function qb(a, b, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0.0,
			i = 0.0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0.0;
		if ((f << 1 | 0) >= (b | 0) | (g | 0) == 0) return;
		m = +(b | 0) / +((_(c[18724 + (g + -1 << 2) >> 2] | 0, f) | 0) + b | 0);
		m = m * m * .5;
		l = +Q(+(m * 1.5707963705062866));
		m = +Q(+((1.0 - m) * 1.5707963705062866));
		a: do
			if ((e << 3 | 0) > (b | 0)) f = 0;
			else {
				g = e >> 2;
				f = 1;
				while (1) {
					if (((_((_(f, f) | 0) + f | 0, e) | 0) + g | 0) >= (b | 0)) break a;
					f = f + 1 | 0
				}
			}
		while (0);
		k = (b >>> 0) / (e >>> 0) | 0;
		g = (d | 0) < 0;
		d = (f | 0) == 0;
		h = -m;
		i = -l;
		j = 0;
		while (1) {
			if ((j | 0) >= (e | 0)) break;
			b = a + ((_(j, k) | 0) << 2) | 0;
			if (!g) {
				sb(b, k, 1, l, h);
				if (!d) sb(b, k, f, m, i)
			} else {
				if (!d) sb(b, k, f, m, l);
				sb(b, k, 1, l, m)
			}
			j = j + 1 | 0
		}
		return
	}

	function rb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0;
		if ((d | 0) < 2) {
			b = 1;
			return b | 0
		}
		h = (b >>> 0) / (d >>> 0) | 0;
		b = 0;
		i = 0;
		do {
			e = _(i, h) | 0;
			f = 0;
			g = 0;
			do {
				g = g | c[a + (e + f << 2) >> 2];
				f = f + 1 | 0
			} while ((f | 0) < (h | 0));
			b = b | ((g | 0) != 0 & 1) << i;
			i = i + 1 | 0
		} while ((i | 0) != (d | 0));
		return b | 0
	}

	function sb(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = +d;
		e = +e;
		var f = 0,
			h = 0,
			i = 0,
			j = 0.0,
			k = 0.0,
			l = 0.0;
		j = -e;
		f = b - c | 0;
		h = a;
		i = 0;
		while (1) {
			if ((i | 0) >= (f | 0)) break;
			l = +g[h >> 2];
			k = +g[h + (c << 2) >> 2];
			g[h + (c << 2) >> 2] = k * d + l * e;
			g[h >> 2] = l * d + k * j;
			h = h + 4 | 0;
			i = i + 1 | 0
		}
		f = b - (c << 1) | 0;
		a = a + (f + -1 << 2) | 0;
		while (1) {
			if ((f | 0) <= 0) break;
			l = +g[a >> 2];
			k = +g[a + (c << 2) >> 2];
			g[a + (c << 2) >> 2] = k * d + l * e;
			g[a >> 2] = l * d + k * j;
			a = a + -4 | 0;
			f = f + -1 | 0
		}
		return
	}

	function tb(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0;
		C = i;
		i = i + 32 | 0;
		B = C;
		o = a + 2772 | 0;
		j = a + 2316 | 0;
		if ((c[j >> 2] | 0) != (c[a + 4156 >> 2] | 0)) {
			g = a + 2340 | 0;
			h = c[g >> 2] | 0;
			k = 32767 / (h + 1 | 0) | 0;
			l = 0;
			m = 0;
			while (1) {
				if ((m | 0) >= (h | 0)) break;
				A = l + k | 0;
				b[a + 4052 + (m << 1) >> 1] = A;
				h = c[g >> 2] | 0;
				l = A;
				m = m + 1 | 0
			}
			c[a + 4148 >> 2] = 0;
			c[a + 4152 >> 2] = 3176576;
			c[a + 4156 >> 2] = c[j >> 2]
		}
		n = a + 4160 | 0;
		do
			if (!(c[n >> 2] | 0)) {
				if (!(c[a + 4164 >> 2] | 0)) {
					h = a + 2340 | 0;
					j = 0;
					while (1) {
						if ((j | 0) >= (c[h >> 2] | 0)) break;
						y = b[a + 2344 + (j << 1) >> 1] | 0;
						A = a + 4052 + (j << 1) | 0;
						x = b[A >> 1] | 0;
						z = x & 65535;
						b[A >> 1] = z + ((((y << 16 >> 16) - (x << 16 >> 16) >> 16) * 16348 | 0) + ((((y & 65535) - z & 65535) * 16348 | 0) >>> 16));
						j = j + 1 | 0
					}
					g = a + 2324 | 0;
					j = c[g >> 2] | 0;
					l = 0;
					m = 0;
					k = 0;
					while (1) {
						if ((m | 0) >= (j | 0)) break;
						z = c[d + 16 + (m << 2) >> 2] | 0;
						y = (z | 0) > (l | 0);
						A = y ? m : k;
						l = y ? z : l;
						m = m + 1 | 0;
						k = A
					}
					h = a + 2332 | 0;
					A = c[h >> 2] | 0;
					uc(a + 2772 + (A << 2) | 0, o | 0, (_(j + -1 | 0, A) | 0) << 2 | 0) | 0;
					h = c[h >> 2] | 0;
					tc(o | 0, a + 4 + ((_(k, h) | 0) << 2) | 0, h << 2 | 0) | 0;
					h = a + 4148 | 0;
					g = c[g >> 2] | 0;
					j = 0;
					while (1) {
						if ((j | 0) >= (g | 0)) break;
						z = c[h >> 2] | 0;
						A = (c[d + 16 + (j << 2) >> 2] | 0) - z | 0;
						c[h >> 2] = z + (((A >> 16) * 4634 | 0) + (((A & 65535) * 4634 | 0) >>> 16));
						j = j + 1 | 0
					}
					if (c[n >> 2] | 0) break
				}
				qc(a + 4084 | 0, 0, c[a + 2340 >> 2] << 2 | 0) | 0;
				i = C;
				return
			}
		while (0);
		z = na() | 0;
		A = i;
		i = i + ((1 * (f + 16 << 2) | 0) + 15 & -16) | 0;
		y = b[a + 4224 >> 1] | 0;
		g = y << 16 >> 16;
		j = c[a + 4244 >> 2] | 0;
		h = j << 16 >> 16;
		j = (_(g >> 16, h) | 0) + ((_(y & 65535, h) | 0) >> 16) + (_(g, (j >> 15) + 1 >> 1) | 0) | 0;
		g = c[a + 4148 >> 2] | 0;
		h = j >> 16;
		if ((j | 0) > 2097151 | (g | 0) > 8388608) {
			j = g >> 16;
			j = (ub((_(j, j) | 0) - ((_(h, h) | 0) << 5) | 0) | 0) << 16
		} else {
			y = j << 16 >> 16;
			x = g << 16 >> 16;
			j = (ub((_(g >> 16, x) | 0) + ((_(g & 65535, x) | 0) >> 16) + (_(g, (g >> 15) + 1 >> 1) | 0) - ((_(h, y) | 0) + ((_(j & 65535, y) | 0) >> 16) + (_(j, (j >> 15) + 1 >> 1) | 0) << 5) | 0) | 0) << 8
		}
		g = 255;
		while (1) {
			if ((g | 0) <= (f | 0)) break;
			g = g >> 1
		}
		k = a + 4152 | 0;
		h = j << 12 >> 16;
		j = (j >> 19) + 1 >> 1;
		l = c[k >> 2] | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (f | 0)) break;
			y = (_(l, 196314165) | 0) + 907633515 | 0;
			x = c[a + 2772 + ((y >> 24 & g) << 2) >> 2] | 0;
			x = (_(x >> 16, h) | 0) + ((_(x & 65535, h) | 0) >> 16) + (_(x, j) | 0) | 0;
			c[A + (m + 16 << 2) >> 2] = ((x | 0) > 32767 ? 32767 : (x | 0) < -32768 ? -32768 : x) << 16 >> 16;
			l = y;
			m = m + 1 | 0
		}
		c[k >> 2] = l;
		y = a + 2340 | 0;
		Jb(B, a + 4052 | 0, c[y >> 2] | 0);
		a = a + 4084 | 0;
		j = A;
		h = a;
		g = j + 64 | 0;
		do {
			c[j >> 2] = c[h >> 2];
			j = j + 4 | 0;
			h = h + 4 | 0
		} while ((j | 0) < (g | 0));
		m = b[B >> 1] | 0;
		l = b[B + 2 >> 1] | 0;
		k = b[B + 4 >> 1] | 0;
		j = b[B + 6 >> 1] | 0;
		h = b[B + 8 >> 1] | 0;
		g = b[B + 10 >> 1] | 0;
		p = b[B + 12 >> 1] | 0;
		q = b[B + 14 >> 1] | 0;
		r = b[B + 16 >> 1] | 0;
		s = b[B + 18 >> 1] | 0;
		t = b[B + 20 >> 1] | 0;
		u = b[B + 22 >> 1] | 0;
		v = b[B + 24 >> 1] | 0;
		w = b[B + 26 >> 1] | 0;
		x = b[B + 28 >> 1] | 0;
		o = b[B + 30 >> 1] | 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (f | 0)) break;
			B = c[A + (n + 15 << 2) >> 2] | 0;
			B = (c[y >> 2] >> 1) + ((_(B >> 16, m) | 0) + ((_(B & 65535, m) | 0) >> 16)) | 0;
			d = c[A + (n + 14 << 2) >> 2] | 0;
			d = B + ((_(d >> 16, l) | 0) + ((_(d & 65535, l) | 0) >> 16)) | 0;
			B = c[A + (n + 13 << 2) >> 2] | 0;
			B = d + ((_(B >> 16, k) | 0) + ((_(B & 65535, k) | 0) >> 16)) | 0;
			d = c[A + (n + 12 << 2) >> 2] | 0;
			d = B + ((_(d >> 16, j) | 0) + ((_(d & 65535, j) | 0) >> 16)) | 0;
			B = c[A + (n + 11 << 2) >> 2] | 0;
			B = d + ((_(B >> 16, h) | 0) + ((_(B & 65535, h) | 0) >> 16)) | 0;
			d = c[A + (n + 10 << 2) >> 2] | 0;
			d = B + ((_(d >> 16, g) | 0) + ((_(d & 65535, g) | 0) >> 16)) | 0;
			B = c[A + (n + 9 << 2) >> 2] | 0;
			B = d + ((_(B >> 16, p) | 0) + ((_(B & 65535, p) | 0) >> 16)) | 0;
			d = c[A + (n + 8 << 2) >> 2] | 0;
			d = B + ((_(d >> 16, q) | 0) + ((_(d & 65535, q) | 0) >> 16)) | 0;
			B = c[A + (n + 7 << 2) >> 2] | 0;
			B = d + ((_(B >> 16, r) | 0) + ((_(B & 65535, r) | 0) >> 16)) | 0;
			d = c[A + (n + 6 << 2) >> 2] | 0;
			d = B + ((_(d >> 16, s) | 0) + ((_(d & 65535, s) | 0) >> 16)) | 0;
			if ((c[y >> 2] | 0) == 16) {
				B = c[A + (n + 5 << 2) >> 2] | 0;
				B = d + ((_(B >> 16, t) | 0) + ((_(B & 65535, t) | 0) >> 16)) | 0;
				d = c[A + (n + 4 << 2) >> 2] | 0;
				d = B + ((_(d >> 16, u) | 0) + ((_(d & 65535, u) | 0) >> 16)) | 0;
				B = c[A + (n + 3 << 2) >> 2] | 0;
				B = d + ((_(B >> 16, v) | 0) + ((_(B & 65535, v) | 0) >> 16)) | 0;
				d = c[A + (n + 2 << 2) >> 2] | 0;
				d = B + ((_(d >> 16, w) | 0) + ((_(d & 65535, w) | 0) >> 16)) | 0;
				B = c[A + (n + 1 << 2) >> 2] | 0;
				B = d + ((_(B >> 16, x) | 0) + ((_(B & 65535, x) | 0) >> 16)) | 0;
				d = c[A + (n << 2) >> 2] | 0;
				d = B + ((_(d >> 16, o) | 0) + ((_(d & 65535, o) | 0) >> 16)) | 0
			}
			D = A + (n + 16 << 2) | 0;
			B = (c[D >> 2] | 0) + (d << 4) | 0;
			c[D >> 2] = B;
			d = e + (n << 1) | 0;
			B = (b[d >> 1] | 0) + ((B >> 9) + 1 >> 1) | 0;
			b[d >> 1] = (B | 0) > 32767 ? 32767 : (B | 0) < -32768 ? -32768 : B;
			n = n + 1 | 0
		}
		j = a;
		h = A + (f << 2) | 0;
		g = j + 64 | 0;
		do {
			c[j >> 2] = c[h >> 2];
			j = j + 4 | 0;
			h = h + 4 | 0
		} while ((j | 0) < (g | 0));
		va(z | 0);
		i = C;
		return
	}

	function ub(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0;
		if ((a | 0) < 1) {
			a = 0;
			return a | 0
		}
		d = aa(a | 0) | 0;
		b = 24 - d | 0;
		c = 0 - b | 0;
		do
			if (b)
				if ((b | 0) < 0) {
					a = a << c | a >>> (b + 32 | 0);
					break
				} else {
					a = a << 32 - b | a >>> b;
					break
				}
		while (0);
		b = ((d & 1 | 0) == 0 ? 46214 : 32768) >>> (d >>> 1);
		a = (_(a & 127, 13959168) | 0) >>> 16;
		a = b + ((_(b >> 16, a) | 0) + ((_(b & 65535, a) | 0) >>> 16)) | 0;
		return a | 0
	}

	function vb(a) {
		a = a | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0;
		qc(a | 0, 0, 4260) | 0;
		c[a + 2376 >> 2] = 1;
		c[a >> 2] = 65536;
		d = a + 2340 | 0;
		e = 0;
		f = 0;
		g = 0;
		while (1) {
			if ((g | 0) >= (e | 0)) break;
			h = f + 32767 | 0;
			b[a + 4052 + (g << 1) >> 1] = h;
			e = c[d >> 2] | 0;
			f = h;
			g = g + 1 | 0
		}
		c[a + 4148 >> 2] = 0;
		c[a + 4152 >> 2] = 3176576;
		c[a + 4168 >> 2] = c[a + 2328 >> 2] << 7;
		c[a + 4240 >> 2] = 65536;
		c[a + 4244 >> 2] = 65536;
		c[a + 4256 >> 2] = 20;
		c[a + 4252 >> 2] = 2;
		return
	}

	function wb(d, e, f, g, h) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0,
			$ = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0,
			ia = 0;
		ga = i;
		i = i + 32 | 0;
		ea = ga;
		X = d + 2336 | 0;
		ca = c[X >> 2] | 0;
		$ = i;
		i = i + ((1 * (ca << 1) | 0) + 15 & -16) | 0;
		p = d + 2328 | 0;
		k = c[p >> 2] | 0;
		ba = i;
		i = i + ((1 * (ca + k << 2) | 0) + 15 & -16) | 0;
		ca = d + 2332 | 0;
		Z = c[ca >> 2] | 0;
		da = i;
		i = i + ((1 * (Z << 2) | 0) + 15 & -16) | 0;
		Y = i;
		i = i + ((1 * (Z + 16 << 2) | 0) + 15 & -16) | 0;
		Z = d + 2765 | 0;
		r = (a[d + 2767 >> 0] | 0) < 4 ? 1 : 0;
		o = b[21860 + (a[Z >> 0] >> 1 << 2) + (a[d + 2766 >> 0] << 1) >> 1] << 4;
		j = a[d + 2770 >> 0] | 0;
		q = 0;
		while (1) {
			if ((q | 0) >= (k | 0)) break;
			m = (_(j, 196314165) | 0) + 907633515 | 0;
			n = g + (q << 1) | 0;
			j = b[n >> 1] | 0;
			k = j << 16 >> 16 << 14;
			l = d + 4 + (q << 2) | 0;
			c[l >> 2] = k;
			if (j << 16 >> 16 <= 0) {
				if (j << 16 >> 16 < 0) {
					k = k | 1280;
					c[l >> 2] = k
				}
			} else {
				k = k + -1280 | 0;
				c[l >> 2] = k
			}
			k = k + o | 0;
			c[l >> 2] = (m | 0) < 0 ? 0 - k | 0 : k;
			k = c[p >> 2] | 0;
			j = m + (b[n >> 1] | 0) | 0;
			q = q + 1 | 0
		}
		S = d + 1284 | 0;
		q = Y;
		g = S;
		p = q + 64 | 0;
		do {
			c[q >> 2] = c[g >> 2];
			q = q + 4 | 0;
			g = g + 4 | 0
		} while ((q | 0) < (p | 0));
		T = d + 2324 | 0;
		U = d + 2340 | 0;
		V = d + 4160 | 0;
		W = e + 136 | 0;
		w = (r | 0) == 0;
		x = ea + 2 | 0;
		y = ea + 4 | 0;
		z = ea + 6 | 0;
		A = ea + 8 | 0;
		B = ea + 10 | 0;
		D = ea + 12 | 0;
		E = ea + 14 | 0;
		F = ea + 16 | 0;
		G = ea + 18 | 0;
		H = ea + 20 | 0;
		I = ea + 22 | 0;
		J = ea + 24 | 0;
		K = ea + 26 | 0;
		L = ea + 28 | 0;
		M = ea + 30 | 0;
		N = d + 4164 | 0;
		O = d + 2308 | 0;
		P = d + 4 | 0;
		Q = f;
		s = c[X >> 2] | 0;
		R = 0;
		while (1) {
			if ((R | 0) >= (c[T >> 2] | 0)) break;
			k = e + 32 + (R >> 1 << 5) | 0;
			tc(ea | 0, k | 0, c[U >> 2] << 1 | 0) | 0;
			j = R * 5 | 0;
			t = e + 96 + (j << 1) | 0;
			m = a[Z >> 0] | 0;
			l = m << 24 >> 24;
			v = c[e + 16 + (R << 2) >> 2] | 0;
			u = v >>> 6;
			o = (v | 0) > 0;
			if (!o) {
				r = 0 - v | 0;
				if (!r) r = 32;
				else fa = 12
			} else {
				r = v;
				fa = 12
			}
			if ((fa | 0) == 12) {
				fa = 0;
				r = aa(r | 0) | 0
			}
			q = v << r + -1;
			ha = q >> 16;
			p = 536870911 / (ha | 0) | 0;
			n = p << 16;
			g = n >> 16;
			q = 536870912 - ((_(ha, g) | 0) + ((_(q & 65535, g) | 0) >> 16)) << 3;
			p = n + ((_(q >> 16, g) | 0) + ((_(q & 65528, g) | 0) >> 16)) + (_(q, (p >> 15) + 1 >> 1) | 0) | 0;
			r = 62 - r | 0;
			q = r + -47 | 0;
			if ((q | 0) < 1) {
				g = 47 - r | 0;
				q = -2147483648 >> g;
				r = 2147483647 >>> g;
				if ((q | 0) > (r | 0))
					if ((p | 0) > (q | 0)) r = q;
					else r = (p | 0) < (r | 0) ? r : p;
				else if ((p | 0) <= (r | 0)) r = (p | 0) < (q | 0) ? q : p;
				r = r << g
			} else r = (q | 0) < 32 ? p >> q : 0;
			g = c[d >> 2] | 0;
			a: do
				if ((v | 0) == (g | 0)) n = 65536;
				else {
					if ((g | 0) <= 0) {
						q = 0 - g | 0;
						if (!q) p = 32;
						else fa = 24
					} else {
						q = g;
						fa = 24
					}
					if ((fa | 0) == 24) {
						fa = 0;
						p = aa(q | 0) | 0
					}
					g = g << p + -1;
					if (!o) {
						q = 0 - v | 0;
						if (!q) q = 32;
						else fa = 27
					} else {
						q = v;
						fa = 27
					}
					if ((fa | 0) == 27) {
						fa = 0;
						q = aa(q | 0) | 0
					}
					q = q + -1 | 0;
					ha = v << q;
					o = (536870911 / (ha >> 16 | 0) | 0) << 16 >> 16;
					n = (_(g >> 16, o) | 0) + ((_(g & 65535, o) | 0) >> 16) | 0;
					ha = Bc(ha | 0, ((ha | 0) < 0) << 31 >> 31 | 0, n | 0, ((n | 0) < 0) << 31 >> 31 | 0) | 0;
					ha = rc(ha | 0, C | 0, 29) | 0;
					g = g - (ha & -8) | 0;
					o = n + ((_(g >> 16, o) | 0) + ((_(g & 65535, o) | 0) >> 16)) | 0;
					q = p + 28 - q | 0;
					g = q + -16 | 0;
					if ((q | 0) < 16) {
						p = 16 - q | 0;
						g = -2147483648 >> p;
						q = 2147483647 >>> p;
						if ((g | 0) > (q | 0))
							if ((o | 0) > (g | 0)) q = g;
							else q = (o | 0) < (q | 0) ? q : o;
						else if ((o | 0) <= (q | 0)) q = (o | 0) < (g | 0) ? g : o;
						q = q << p
					} else q = (g | 0) < 32 ? o >> g : 0;
					g = q >> 16;
					p = q & 65535;
					o = 0;
					while (1) {
						if ((o | 0) == 16) {
							n = q;
							break a
						}
						n = Y + (o << 2) | 0;
						ha = c[n >> 2] | 0;
						ia = ha << 16 >> 16;
						c[n >> 2] = (_(g, ia) | 0) + ((_(p, ia) | 0) >> 16) + (_(q, (ha >> 15) + 1 >> 1) | 0);
						o = o + 1 | 0
					}
				}
			while (0);
			c[d >> 2] = v;
			if ((c[V >> 2] | 0) != 0 ? (((c[N >> 2] | 0) != 2 | m << 24 >> 24 == 2) ^ 1) & (R | 0) < 2 : 0) {
				b[t >> 1] = 0;
				b[t + 2 >> 1] = 0;
				b[t + 4 >> 1] = 0;
				b[t + 6 >> 1] = 0;
				b[t + 8 >> 1] = 0;
				b[e + 96 + (j + 2 << 1) >> 1] = 4096;
				c[e + (R << 2) >> 2] = c[O >> 2];
				fa = 43
			} else if ((l | 0) == 2) fa = 43;
			else {
				o = P;
				n = s
			}
			b: do
				if ((fa | 0) == 43) {
					fa = 0;
					l = c[e + (R << 2) >> 2] | 0;
					o = (R | 0) == 0;
					c: do
						if (!o) {
							if (!((R | 0) == 2 ^ 1 | w)) {
								g = c[X >> 2] | 0;
								q = g - l - (c[U >> 2] | 0) + -2 | 0;
								tc(d + 1348 + (g << 1) | 0, f | 0, c[ca >> 2] << 2 | 0) | 0;
								g = c[X >> 2] | 0;
								p = c[U >> 2] | 0;
								fa = 47;
								break
							}
							if ((n | 0) != 65536) {
								r = l + 2 | 0;
								q = n >> 16;
								g = n & 65535;
								p = 0;
								while (1) {
									if ((p | 0) >= (r | 0)) break c;
									o = ba + (s - p + -1 << 2) | 0;
									m = c[o >> 2] | 0;
									k = m << 16 >> 16;
									c[o >> 2] = (_(q, k) | 0) + ((_(g, k) | 0) >> 16) + (_(n, (m >> 15) + 1 >> 1) | 0);
									p = p + 1 | 0
								}
							}
						} else {
							g = c[X >> 2] | 0;
							p = c[U >> 2] | 0;
							q = g - l - p + -2 | 0;
							fa = 47
						}
					while (0);
					d: do
						if ((fa | 0) == 47) {
							fa = 0;
							Hb($ + (q << 1) | 0, d + 1348 + (q + (_(R, c[ca >> 2] | 0) | 0) << 1) | 0, k, g - q | 0, p, h);
							if (o) {
								q = c[W >> 2] << 16 >> 16;
								r = (_(r >> 16, q) | 0) + ((_(r & 65535, q) | 0) >> 16) << 2
							}
							g = l + 2 | 0;
							p = r >> 16;
							r = r & 65535;
							q = 0;
							while (1) {
								if ((q | 0) >= (g | 0)) break d;
								o = b[$ + ((c[X >> 2] | 0) - q + -1 << 1) >> 1] | 0;
								c[ba + (s - q + -1 << 2) >> 2] = (_(p, o) | 0) + ((_(r, o) | 0) >> 16);
								q = q + 1 | 0
							}
						}
					while (0);
					o = e + 96 + (j + 1 << 1) | 0;
					n = e + 96 + (j + 2 << 1) | 0;
					m = e + 96 + (j + 3 << 1) | 0;
					p = e + 96 + (j + 4 << 1) | 0;
					q = ba + (s - l + 2 << 2) | 0;
					g = s;
					r = 0;
					while (1) {
						if ((r | 0) >= (c[ca >> 2] | 0)) {
							o = da;
							n = g;
							break b
						}
						k = c[q >> 2] | 0;
						l = b[t >> 1] | 0;
						l = (_(k >> 16, l) | 0) + ((_(k & 65535, l) | 0) >> 16) + 2 | 0;
						k = c[q + -4 >> 2] | 0;
						j = b[o >> 1] | 0;
						j = l + ((_(k >> 16, j) | 0) + ((_(k & 65535, j) | 0) >> 16)) | 0;
						k = c[q + -8 >> 2] | 0;
						l = b[n >> 1] | 0;
						l = j + ((_(k >> 16, l) | 0) + ((_(k & 65535, l) | 0) >> 16)) | 0;
						k = c[q + -12 >> 2] | 0;
						j = b[m >> 1] | 0;
						j = l + ((_(k >> 16, j) | 0) + ((_(k & 65535, j) | 0) >> 16)) | 0;
						k = c[q + -16 >> 2] | 0;
						l = b[p >> 1] | 0;
						l = j + ((_(k >> 16, l) | 0) + ((_(k & 65535, l) | 0) >> 16)) | 0;
						l = (c[P + (r << 2) >> 2] | 0) + (l << 1) | 0;
						c[da + (r << 2) >> 2] = l;
						c[ba + (g << 2) >> 2] = l << 1;
						q = q + 4 | 0;
						g = g + 1 | 0;
						r = r + 1 | 0
					}
				}
			while (0);
			p = u << 16 >> 16;
			q = (v >> 21) + 1 >> 1;
			g = 0;
			while (1) {
				r = c[ca >> 2] | 0;
				if ((g | 0) >= (r | 0)) break;
				m = c[Y + (g + 15 << 2) >> 2] | 0;
				l = b[ea >> 1] | 0;
				l = (c[U >> 2] >> 1) + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
				m = c[Y + (g + 14 << 2) >> 2] | 0;
				r = b[x >> 1] | 0;
				r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
				m = c[Y + (g + 13 << 2) >> 2] | 0;
				l = b[y >> 1] | 0;
				l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
				m = c[Y + (g + 12 << 2) >> 2] | 0;
				r = b[z >> 1] | 0;
				r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
				m = c[Y + (g + 11 << 2) >> 2] | 0;
				l = b[A >> 1] | 0;
				l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
				m = c[Y + (g + 10 << 2) >> 2] | 0;
				r = b[B >> 1] | 0;
				r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
				m = c[Y + (g + 9 << 2) >> 2] | 0;
				l = b[D >> 1] | 0;
				l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
				m = c[Y + (g + 8 << 2) >> 2] | 0;
				r = b[E >> 1] | 0;
				r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
				m = c[Y + (g + 7 << 2) >> 2] | 0;
				l = b[F >> 1] | 0;
				l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
				m = c[Y + (g + 6 << 2) >> 2] | 0;
				r = b[G >> 1] | 0;
				r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
				if ((c[U >> 2] | 0) == 16) {
					m = c[Y + (g + 5 << 2) >> 2] | 0;
					l = b[H >> 1] | 0;
					l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
					m = c[Y + (g + 4 << 2) >> 2] | 0;
					r = b[I >> 1] | 0;
					r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
					m = c[Y + (g + 3 << 2) >> 2] | 0;
					l = b[J >> 1] | 0;
					l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
					m = c[Y + (g + 2 << 2) >> 2] | 0;
					r = b[K >> 1] | 0;
					r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0;
					m = c[Y + (g + 1 << 2) >> 2] | 0;
					l = b[L >> 1] | 0;
					l = r + ((_(m >> 16, l) | 0) + ((_(m & 65535, l) | 0) >> 16)) | 0;
					m = c[Y + (g << 2) >> 2] | 0;
					r = b[M >> 1] | 0;
					r = l + ((_(m >> 16, r) | 0) + ((_(m & 65535, r) | 0) >> 16)) | 0
				}
				r = (c[o + (g << 2) >> 2] | 0) + (r << 4) | 0;
				c[Y + (g + 16 << 2) >> 2] = r;
				r = ((_(r >> 16, p) | 0) + ((_(r & 65535, p) | 0) >> 16) + (_(r, q) | 0) >> 7) + 1 >> 1;
				b[Q + (g << 1) >> 1] = (r | 0) > 32767 ? 32767 : (r | 0) < -32768 ? -32768 : r;
				g = g + 1 | 0
			}
			q = Y;
			g = Y + (r << 2) | 0;
			p = q + 64 | 0;
			do {
				c[q >> 2] = c[g >> 2];
				q = q + 4 | 0;
				g = g + 4 | 0
			} while ((q | 0) < (p | 0));
			P = P + (r << 2) | 0;
			Q = Q + (r << 1) | 0;
			s = n;
			R = R + 1 | 0
		}
		q = S;
		g = Y;
		p = q + 64 | 0;
		do {
			c[q >> 2] = c[g >> 2];
			q = q + 4 | 0;
			g = g + 4 | 0
		} while ((q | 0) < (p | 0));
		i = ga;
		return
	}

	function xb(f, g, h, j, k, l, m) {
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0;
		L = i;
		i = i + 320 | 0;
		H = L + 176 | 0;
		I = L + 144 | 0;
		y = L + 288 | 0;
		t = L + 256 | 0;
		B = L + 224 | 0;
		A = L + 192 | 0;
		K = L;
		G = f + 2328 | 0;
		J = c[G >> 2] | 0;
		c[K + 136 >> 2] = 0;
		switch (k | 0) {
			case 0:
				{
					p = f + 2388 | 0;C = 4;
					break
				}
			case 2:
				{
					p = f + 2388 | 0;
					if ((c[f + 2420 + (c[p >> 2] << 2) >> 2] | 0) == 1) C = 4;
					else C = 106;
					break
				}
			default:
				C = 106
		}
		if ((C | 0) == 4) {
			E = na() | 0;
			F = i;
			i = i + ((1 * ((J + 15 & -16) << 1) | 0) + 15 & -16) | 0;
			yb(f, g, c[p >> 2] | 0, k, l);
			D = f + 2765 | 0;
			zb(g, F, a[D >> 0] | 0, a[f + 2766 >> 0] | 0, c[G >> 2] | 0);
			r = f + 2736 | 0;
			s = f + 2312 | 0;
			v = (l | 0) == 2;
			z = f + 2324 | 0;
			l = c[z >> 2] | 0;
			q = 0;
			while (1) {
				if ((q | 0) >= (l | 0)) break;
				do
					if ((q | 0) == 0 ^ 1 | v) {
						k = (a[f + 2736 + q >> 0] | 0) + -4 | 0;
						g = a[s >> 0] | 0;
						p = (g << 24 >> 24) + 8 | 0;
						if ((k | 0) > (p | 0)) {
							k = (g & 255) + ((k << 1) - p) & 255;
							a[s >> 0] = k;
							break
						} else {
							k = (g & 255) + k & 255;
							a[s >> 0] = k;
							break
						}
					} else {
						x = a[r >> 0] | 0;
						k = (a[s >> 0] | 0) + -16 | 0;
						k = ((x | 0) > (k | 0) ? x : k) & 255;
						a[s >> 0] = k
					}
				while (0);
				if (k << 24 >> 24 > 63) k = 63;
				else k = k << 24 >> 24 < 0 ? 0 : k << 24 >> 24;
				a[s >> 0] = k;
				k = (k * 29 | 0) + (k * 7281 >> 16) + 2090 | 0;
				if ((k | 0) < 3967)
					if ((k | 0) < 0) k = 0;
					else {
						u = k >> 7;
						o = 1 << u;
						n = k & 127;
						if ((k | 0) < 2048) k = n + ((_(_(n, 128 - n | 0) | 0, -174) | 0) >> 16) << u >> 7;
						else k = _(o >> 7, n + ((_(_(n, 128 - n | 0) | 0, -174) | 0) >> 16) | 0) | 0;
						k = o + k | 0
					}
				else k = 2147483647;
				c[K + 16 + (q << 2) >> 2] = k;
				q = q + 1 | 0
			}
			k = f + 2744 | 0;
			w = c[f + 2732 >> 2] | 0;
			v = w + 2 | 0;
			l = b[v >> 1] | 0;
			g = _(a[k >> 0] | 0, l << 16 >> 16) | 0;
			p = c[w + 8 >> 2] | 0;
			o = 0;
			while (1) {
				if ((o | 0) >= (l << 16 >> 16 | 0)) break;
				b[B + (o << 1) >> 1] = d[p + (g + o) >> 0] << 7;
				l = b[v >> 1] | 0;
				o = o + 1 | 0
			}
			Eb(I, H, w, a[k >> 0] | 0);
			k = b[v >> 1] | 0;
			l = k << 16 >> 16;
			p = b[w + 4 >> 1] | 0;
			r = 0;
			u = l;
			while (1) {
				g = u + -1 | 0;
				if ((u | 0) <= 0) break;
				o = (_(r << 16 >> 16, d[H + g >> 0] | 0) | 0) >> 8;
				u = a[f + 2744 + u >> 0] | 0;
				n = u << 24 >> 24 << 10;
				if (u << 24 >> 24 > 0) r = n + -102 | 0;
				else r = u << 24 >> 24 < 0 ? n | 102 : n;
				r = o + ((_(r >> 16, p) | 0) + ((_(r & 65535, p) | 0) >> 16)) | 0;
				b[y + (g << 1) >> 1] = r;
				u = g
			}
			p = b[B >> 1] | 0;
			g = p << 16 >> 16;
			x = (b[B + 2 >> 1] | 0) - g | 0;
			x = 131072 / (((x | 0) > 1 ? x : 1) | 0) | 0;
			g = (131072 / ((p << 16 >> 16 > 1 ? g : 1) | 0) | 0) + x | 0;
			b[t >> 1] = (g | 0) < 32767 ? g : 32767;
			g = l + -1 | 0;
			p = 1;
			l = x;
			while (1) {
				if ((p | 0) >= (g | 0)) break;
				n = p + 1 | 0;
				x = B + (n << 1) | 0;
				o = (b[x >> 1] | 0) - (b[B + (p << 1) >> 1] | 0) | 0;
				o = 131072 / (((o | 0) > 1 ? o : 1) | 0) | 0;
				u = o + l | 0;
				b[t + (p << 1) >> 1] = (u | 0) < 32767 ? u : 32767;
				u = p + 2 | 0;
				x = (b[B + (u << 1) >> 1] | 0) - (b[x >> 1] | 0) | 0;
				x = 131072 / (((x | 0) > 1 ? x : 1) | 0) | 0;
				o = o + x | 0;
				b[t + (n << 1) >> 1] = (o | 0) < 32767 ? o : 32767;
				p = u;
				l = x
			}
			u = 32768 - (b[B + (g << 1) >> 1] | 0) | 0;
			u = (131072 / (((u | 0) > 1 ? u : 1) | 0) | 0) + l | 0;
			b[t + (g << 1) >> 1] = (u | 0) < 32767 ? u : 32767;
			u = 0;
			while (1) {
				x = k << 16 >> 16;
				if ((u | 0) >= (x | 0)) break;
				g = b[t + (u << 1) >> 1] | 0;
				k = (g & 65535) << 16;
				if ((k | 0) < 1) k = 0;
				else {
					if (!(g << 16 >> 16)) l = 32;
					else l = aa(k | 0) | 0;
					g = 24 - l | 0;
					p = 0 - g | 0;
					do
						if (g)
							if ((g | 0) < 0) {
								k = k << p | k >>> (g + 32 | 0);
								break
							} else {
								k = k << 32 - g | k >>> g;
								break
							}
					while (0);
					x = ((l & 1 | 0) == 0 ? 46214 : 32768) >>> (l >>> 1);
					k = (_(k & 127, 13959168) | 0) >>> 16;
					k = x + ((_(x >> 16, k) | 0) + ((_(x & 65535, k) | 0) >>> 16)) | 0
				}
				x = B + (u << 1) | 0;
				k = (b[x >> 1] | 0) + ((b[y + (u << 1) >> 1] << 14 | 0) / (k | 0) | 0) | 0;
				b[x >> 1] = (k | 0) > 32767 ? 32767 : (k | 0) < 0 ? 0 : k;
				k = b[v >> 1] | 0;
				u = u + 1 | 0
			}
			t = c[w + 32 >> 2] | 0;
			q = x + -1 | 0;
			w = B + (q << 1) | 0;
			s = t + (x << 1) | 0;
			r = 0;
			while (1) {
				if ((r | 0) >= 20) {
					C = 65;
					break
				}
				p = b[B >> 1] | 0;
				l = b[t >> 1] | 0;
				u = p;
				n = 0;
				p = (p << 16 >> 16) - (l << 16 >> 16) | 0;
				o = 1;
				while (1) {
					if ((o | 0) > (q | 0)) break;
					g = b[B + (o << 1) >> 1] | 0;
					y = (g << 16 >> 16) - ((u << 16 >> 16) + (b[t + (o << 1) >> 1] | 0)) | 0;
					v = (y | 0) < (p | 0);
					u = g;
					n = v ? o : n;
					p = v ? y : p;
					o = o + 1 | 0
				}
				y = 32768 - ((b[w >> 1] | 0) + (b[s >> 1] | 0)) | 0;
				v = (y | 0) < (p | 0);
				g = v ? x : n;
				if (((v ? y : p) | 0) > -1) break;
				do
					if (!g) b[B >> 1] = l;
					else {
						if ((g | 0) == (x | 0)) {
							b[w >> 1] = 32768 - (e[s >> 1] | 0);
							break
						} else {
							l = 0;
							k = 0
						}
						while (1) {
							if ((k | 0) >= (g | 0)) break;
							l = l + (b[t + (k << 1) >> 1] | 0) | 0;
							k = k + 1 | 0
						}
						p = t + (g << 1) | 0;
						k = b[p >> 1] | 0;
						n = k >> 1;
						o = 32768;
						u = x;
						while (1) {
							if ((u | 0) <= (g | 0)) break;
							o = o - (b[t + (u << 1) >> 1] | 0) | 0;
							u = u + -1 | 0
						}
						v = l + n | 0;
						u = o - n | 0;
						l = B + (g + -1 << 1) | 0;
						y = b[l >> 1] | 0;
						o = B + (g << 1) | 0;
						n = b[o >> 1] | 0;
						n = ((y << 16 >> 16) + (n << 16 >> 16) >> 1) + ((y & 65535) + (n & 65535) & 1) | 0;
						if ((v | 0) > (u | 0))
							if ((n | 0) > (v | 0)) u = v;
							else u = (n | 0) < (u | 0) ? u : n;
						else if ((n | 0) <= (u | 0)) u = (n | 0) < (v | 0) ? v : n;
						y = u - (k >>> 1) | 0;
						b[l >> 1] = y;
						b[o >> 1] = y + (e[p >> 1] | 0)
					}
				while (0);
				r = r + 1 | 0
			}
			a: do
				if ((C | 0) == 65 ? (r | 0) == 20 : 0) {
					p = 1;
					while (1) {
						if ((p | 0) >= (x | 0)) break;
						k = b[B + (p << 1) >> 1] | 0;
						o = p;
						while (1) {
							l = o + -1 | 0;
							if ((o | 0) <= 0) break;
							g = b[B + (l << 1) >> 1] | 0;
							if (k << 16 >> 16 >= g << 16 >> 16) break;
							b[B + (o << 1) >> 1] = g;
							o = l
						}
						b[B + (o << 1) >> 1] = k;
						p = p + 1 | 0
					}
					g = b[B >> 1] | 0;
					k = b[t >> 1] | 0;
					k = g << 16 >> 16 > k << 16 >> 16 ? g << 16 >> 16 : k << 16 >> 16;
					b[B >> 1] = k;
					g = 1;
					while (1) {
						if ((g | 0) >= (x | 0)) break;
						v = B + (g << 1) | 0;
						u = b[v >> 1] | 0;
						y = (k << 16 >> 16) + (b[t + (g << 1) >> 1] | 0) | 0;
						y = (u | 0) > (y | 0) ? u : y;
						b[v >> 1] = y;
						k = y;
						g = g + 1 | 0
					}
					p = b[w >> 1] | 0;
					l = 32768 - (b[s >> 1] | 0) | 0;
					l = (p | 0) < (l | 0) ? p : l;
					b[w >> 1] = l;
					p = x + -2 | 0;
					while (1) {
						if ((p | 0) <= -1) break a;
						x = B + (p << 1) | 0;
						w = b[x >> 1] | 0;
						y = (l << 16 >> 16) - (b[t + (p + 1 << 1) >> 1] | 0) | 0;
						y = (w | 0) < (y | 0) ? w : y;
						b[x >> 1] = y;
						l = y;
						p = p + -1 | 0
					}
				}
			while (0);
			o = K + 64 | 0;
			n = f + 2340 | 0;
			Jb(o, B, c[n >> 2] | 0);
			w = f + 2376 | 0;
			p = f + 2767 | 0;
			if ((c[w >> 2] | 0) != 1) {
				k = a[p >> 0] | 0;
				if (k << 24 >> 24 < 4) {
					g = c[n >> 2] | 0;
					p = 0;
					while (1) {
						if ((p | 0) >= (g | 0)) break;
						y = b[f + 2344 + (p << 1) >> 1] | 0;
						b[A + (p << 1) >> 1] = (y & 65535) + ((_(k << 24 >> 24, (b[B + (p << 1) >> 1] | 0) - (y << 16 >> 16) | 0) | 0) >>> 2);
						p = p + 1 | 0
					}
					Jb(K + 32 | 0, A, g);
					l = c[n >> 2] | 0
				} else C = 85
			} else {
				a[p >> 0] = 4;
				C = 85
			}
			if ((C | 0) == 85) {
				l = c[n >> 2] | 0;
				tc(K + 32 | 0, K + 64 | 0, l << 1 | 0) | 0
			}
			tc(f + 2344 | 0, B | 0, l << 1 | 0) | 0;
			p = f + 4160 | 0;
			if (c[p >> 2] | 0) {
				Gb(K + 32 | 0, l, 63570);
				Gb(o, c[n >> 2] | 0, 63570)
			}
			if ((a[D >> 0] | 0) == 2) {
				l = c[f + 2316 >> 2] | 0;
				v = c[z >> 2] | 0;
				g = (l | 0) == 8;
				t = (v | 0) == 4;
				u = g ? (t ? 26944 : 26914) : t ? 26988 : 26920;
				t = g ? (t ? 11 : 3) : t ? 34 : 12;
				l = l << 16;
				g = l >> 15;
				l = (l >> 16) * 18 | 0;
				o = g + (b[f + 2762 >> 1] | 0) | 0;
				n = a[f + 2764 >> 0] | 0;
				q = (g | 0) > (l | 0);
				s = 0;
				while (1) {
					if ((s | 0) >= (v | 0)) break;
					k = o + (a[u + ((_(s, t) | 0) + n) >> 0] | 0) | 0;
					r = K + (s << 2) | 0;
					c[r >> 2] = k;
					if (q)
						if ((k | 0) > (g | 0)) k = g;
						else k = (k | 0) < (l | 0) ? l : k;
					else if ((k | 0) > (l | 0)) k = l;
					else k = (k | 0) < (g | 0) ? g : k;
					c[r >> 2] = k;
					s = s + 1 | 0
				}
				l = c[18760 + (a[f + 2768 >> 0] << 2) >> 2] | 0;
				g = 0;
				while (1) {
					if ((g | 0) >= (v | 0)) break;
					o = (a[f + 2740 + g >> 0] | 0) * 5 | 0;
					n = g * 5 | 0;
					k = 0;
					while (1) {
						if ((k | 0) == 5) break;
						b[K + 96 + (n + k << 1) >> 1] = a[l + (o + k) >> 0] << 7;
						k = k + 1 | 0
					}
					g = g + 1 | 0
				}
				c[K + 136 >> 2] = b[21868 + (a[f + 2769 >> 0] << 1) >> 1]
			} else {
				C = c[z >> 2] | 0;
				qc(K | 0, 0, C << 2 | 0) | 0;
				qc(K + 96 | 0, 0, C * 10 | 0) | 0;
				a[f + 2768 >> 0] = 0;
				c[K + 136 >> 2] = 0
			}
			wb(f, K, h, F, m);
			Bb(f, K, h, 0, m);
			c[p >> 2] = 0;
			c[f + 4164 >> 2] = a[D >> 0];
			c[w >> 2] = 0;
			va(E | 0);
			l = K
		} else if ((C | 0) == 106) {
			Bb(f, K, h, 1, m);
			l = K;
			p = f + 4160 | 0
		}
		E = c[G >> 2] | 0;
		F = (c[f + 2336 >> 2] | 0) - E | 0;
		uc(f + 1348 | 0, f + 1348 + (E << 1) | 0, F << 1 | 0) | 0;
		tc(f + 1348 + (F << 1) | 0, h | 0, c[G >> 2] << 1 | 0) | 0;
		tb(f, l, h, J);
		if (c[p >> 2] | 0) {
			Pb(f + 4228 | 0, f + 4232 | 0, h, J);
			c[f + 4216 >> 2] = 1;
			E = f + 2324 | 0;
			E = c[E >> 2] | 0;
			E = E + -1 | 0;
			E = K + (E << 2) | 0;
			E = c[E >> 2] | 0;
			F = f + 2308 | 0;
			c[F >> 2] = E;
			c[j >> 2] = J;
			i = L;
			return 0
		}
		b: do
			if (c[f + 4216 >> 2] | 0) {
				Pb(I, H, h, J);
				n = c[H >> 2] | 0;
				o = c[f + 4232 >> 2] | 0;
				if ((n | 0) <= (o | 0)) {
					if ((n | 0) < (o | 0)) c[I >> 2] = c[I >> 2] >> o - n
				} else {
					F = f + 4228 | 0;
					c[F >> 2] = c[F >> 2] >> n - o
				}
				l = c[I >> 2] | 0;
				o = f + 4228 | 0;
				n = c[o >> 2] | 0;
				if ((l | 0) > (n | 0)) {
					if (!n) p = 31;
					else p = (aa(n | 0) | 0) + -1 | 0;
					F = n << p;
					c[o >> 2] = F;
					n = 24 - p | 0;
					n = l >> ((n | 0) > 0 ? n : 0);
					c[I >> 2] = n;
					n = (F | 0) / (((n | 0) > 1 ? n : 1) | 0) | 0;
					if ((n | 0) < 1) n = 0;
					else {
						p = aa(n | 0) | 0;
						o = 24 - p | 0;
						l = 0 - o | 0;
						do
							if (o)
								if ((o | 0) < 0) {
									n = n << l | n >>> (o + 32 | 0);
									break
								} else {
									n = n << 32 - o | n >>> o;
									break
								}
						while (0);
						F = ((p & 1 | 0) == 0 ? 46214 : 32768) >>> (p >>> 1);
						n = (_(n & 127, 13959168) | 0) >>> 16;
						n = F + ((_(F >> 16, n) | 0) + ((_(F & 65535, n) | 0) >>> 16)) << 4
					}
					p = ((65536 - n | 0) / (J | 0) | 0) << 2;
					l = 0;
					while (1) {
						if ((l | 0) >= (J | 0)) break b;
						F = h + (l << 1) | 0;
						E = b[F >> 1] | 0;
						b[F >> 1] = (_(n >> 16, E) | 0) + ((_(n & 65532, E) | 0) >>> 16);
						n = n + p | 0;
						if ((n | 0) > 65536) break b;
						l = l + 1 | 0
					}
				}
			}
		while (0);
		c[f + 4216 >> 2] = 0;
		E = f + 2324 | 0;
		E = c[E >> 2] | 0;
		E = E + -1 | 0;
		E = K + (E << 2) | 0;
		E = c[E >> 2] | 0;
		F = f + 2308 | 0;
		c[F >> 2] = E;
		c[j >> 2] = J;
		i = L;
		return 0
	}

	function yb(f, g, h, j, k) {
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		s = i;
		i = i + 48 | 0;
		p = s;
		m = s + 32 | 0;
		if ((j | 0) == 0 ? (c[f + 2404 + (h << 2) >> 2] | 0) == 0 : 0) h = Za(g, 25860, 8) | 0;
		else h = (Za(g, 25856, 8) | 0) + 2 | 0;
		j = h >>> 1;
		r = f + 2765 | 0;
		a[r >> 0] = j;
		a[f + 2766 >> 0] = h & 1;
		n = (k | 0) == 2;
		if (n) a[f + 2736 >> 0] = Za(g, 23734, 8) | 0;
		else {
			o = f + 2736 | 0;
			a[o >> 0] = (Za(g, 23710 + (j << 24 >> 24 << 3) | 0, 8) | 0) << 3;
			l = Za(g, 25885, 8) | 0;
			a[o >> 0] = (d[o >> 0] | 0) + l
		}
		o = f + 2324 | 0;
		h = 1;
		while (1) {
			if ((h | 0) >= (c[o >> 2] | 0)) break;
			a[f + 2736 + h >> 0] = Za(g, 23734, 8) | 0;
			h = h + 1 | 0
		}
		l = f + 2732 | 0;
		h = c[l >> 2] | 0;
		j = _(a[r >> 0] >> 1, b[h >> 1] | 0) | 0;
		j = Za(g, (c[h + 12 >> 2] | 0) + j | 0, 8) | 0;
		a[f + 2744 >> 0] = j;
		Eb(p, m, c[l >> 2] | 0, j << 24 >> 24);
		j = 0;
		while (1) {
			h = c[l >> 2] | 0;
			if ((j | 0) >= (b[h + 2 >> 1] | 0)) break;
			h = Za(g, (c[h + 24 >> 2] | 0) + (b[p + (j << 1) >> 1] | 0) | 0, 8) | 0;
			switch (h | 0) {
				case 0:
					{
						h = 0 - (Za(g, 25893, 8) | 0) | 0;
						break
					}
				case 8:
					{
						h = (Za(g, 25893, 8) | 0) + 8 | 0;
						break
					}
				default:
					{}
			}
			m = j + 1 | 0;
			a[f + 2744 + m >> 0] = h + 252;
			j = m
		}
		if ((c[o >> 2] | 0) == 4) h = (Za(g, 25862, 8) | 0) & 255;
		else h = 4;
		a[f + 2767 >> 0] = h;
		if ((a[r >> 0] | 0) != 2) {
			k = a[r >> 0] | 0;
			k = k << 24 >> 24;
			r = f + 2396 | 0;
			c[r >> 2] = k;
			r = Za(g, 25870, 8) | 0;
			r = r & 255;
			k = f + 2770 | 0;
			a[k >> 0] = r;
			i = s;
			return
		}
		if ((n ? (c[f + 2396 >> 2] | 0) == 2 : 0) ? (q = Za(g, 25942, 8) | 0, (q & 65535) << 16 >> 16 > 0) : 0) {
			j = (e[f + 2400 >> 1] | 0) + (q + 65527) & 65535;
			b[f + 2762 >> 1] = j
		} else {
			j = (Za(g, 25910, 8) | 0) << 16 >> 16;
			q = f + 2762 | 0;
			b[q >> 1] = _(j, c[f + 2316 >> 2] >> 1) | 0;
			j = Za(g, c[f + 2380 >> 2] | 0, 8) | 0;
			j = (e[q >> 1] | 0) + j & 65535;
			b[q >> 1] = j
		}
		b[f + 2400 >> 1] = j;
		a[f + 2764 >> 0] = Za(g, c[f + 2384 >> 2] | 0, 8) | 0;
		j = f + 2768 | 0;
		a[j >> 0] = Za(g, 23775, 8) | 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (c[o >> 2] | 0)) break;
			a[f + 2740 + h >> 0] = Za(g, c[18748 + (a[j >> 0] << 2) >> 2] | 0, 8) | 0;
			h = h + 1 | 0
		}
		if (!k) {
			a[f + 2769 >> 0] = Za(g, 25853, 8) | 0;
			k = a[r >> 0] | 0;
			k = k << 24 >> 24;
			r = f + 2396 | 0;
			c[r >> 2] = k;
			r = Za(g, 25870, 8) | 0;
			r = r & 255;
			k = f + 2770 | 0;
			a[k >> 0] = r;
			i = s;
			return
		} else {
			a[f + 2769 >> 0] = 0;
			k = a[r >> 0] | 0;
			k = k << 24 >> 24;
			r = f + 2396 | 0;
			c[r >> 2] = k;
			r = Za(g, 25870, 8) | 0;
			r = r & 255;
			k = f + 2770 | 0;
			a[k >> 0] = r;
			i = s;
			return
		}
	}

	function zb(e, f, g, h, j) {
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0;
		y = i;
		i = i + 176 | 0;
		w = y + 160 | 0;
		x = y + 80 | 0;
		v = y;
		m = Za(e, 26203 + ((g >> 1) * 9 | 0) | 0, 8) | 0;
		u = j >> 4;
		u = (u << 4 | 0) < (j | 0) ? u + 1 | 0 : u;
		m = 26023 + (m * 18 | 0) | 0;
		k = 0;
		while (1) {
			if ((k | 0) >= (u | 0)) {
				s = 0;
				break
			}
			l = v + (k << 2) | 0;
			c[l >> 2] = 0;
			o = x + (k << 2) | 0;
			n = 0;
			q = Za(e, m, 8) | 0;
			while (1) {
				c[o >> 2] = q;
				if ((q | 0) != 17) break;
				q = n + 1 | 0;
				c[l >> 2] = q;
				n = q;
				q = Za(e, 26185 + ((q | 0) == 10 & 1) | 0, 8) | 0
			}
			k = k + 1 | 0
		}
		while (1) {
			if ((s | 0) >= (u | 0)) {
				k = 0;
				break
			}
			n = c[x + (s << 2) >> 2] | 0;
			r = s << 16 >> 12;
			o = f + (r << 1) | 0;
			if ((n | 0) > 0) {
				k = Za(e, 26677 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
				q = k & 65535;
				k = n - k & 65535;
				n = q << 16 >> 16;
				if (q << 16 >> 16 > 0) {
					q = Za(e, 26525 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
					p = q & 65535;
					q = n - q & 65535;
					n = p << 16 >> 16;
					if (p << 16 >> 16 > 0) {
						p = Za(e, 26373 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
						l = p & 65535;
						n = n - p & 65535;
						p = f + ((r | 1) << 1) | 0;
						m = l << 16 >> 16;
						if (l << 16 >> 16 > 0) {
							z = Za(e, 26221 + (d[26829 + m >> 0] | 0) | 0, 8) | 0;
							b[o >> 1] = z;
							l = q;
							q = m - z & 65535
						} else t = 14
					} else t = 11
				} else {
					q = 0;
					t = 11
				}
				if ((t | 0) == 11) {
					p = f + ((r | 1) << 1) | 0;
					n = 0;
					t = 14
				}
				if ((t | 0) == 14) {
					t = 0;
					b[o >> 1] = 0;
					l = q;
					q = 0
				}
				b[p >> 1] = q;
				q = f + ((r | 2) << 1) | 0;
				p = n << 16 >> 16;
				if (n << 16 >> 16 > 0) {
					o = Za(e, 26221 + (d[26829 + p >> 0] | 0) | 0, 8) | 0;
					b[q >> 1] = o;
					o = p - o & 65535
				} else {
					b[q >> 1] = 0;
					o = 0
				}
				b[f + ((r | 3) << 1) >> 1] = o;
				o = l << 16 >> 16;
				if (l << 16 >> 16 > 0) {
					p = Za(e, 26373 + (d[26829 + o >> 0] | 0) | 0, 8) | 0;
					m = p & 65535;
					o = o - p & 65535;
					p = f + ((r | 4) << 1) | 0;
					q = f + ((r | 5) << 1) | 0;
					n = m << 16 >> 16;
					if (m << 16 >> 16 > 0) {
						l = Za(e, 26221 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
						b[p >> 1] = l;
						p = q;
						m = o;
						q = n - l & 65535
					} else t = 22
				} else {
					p = f + ((r | 4) << 1) | 0;
					q = f + ((r | 5) << 1) | 0;
					o = 0;
					t = 22
				}
				if ((t | 0) == 22) {
					t = 0;
					b[p >> 1] = 0;
					p = q;
					m = o;
					q = 0
				}
				b[p >> 1] = q;
				o = f + ((r | 6) << 1) | 0;
				n = m << 16 >> 16;
				if (m << 16 >> 16 > 0) {
					q = Za(e, 26221 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
					b[o >> 1] = q;
					o = n - q & 65535
				} else {
					b[o >> 1] = 0;
					o = 0
				}
				b[f + ((r | 7) << 1) >> 1] = o;
				o = k << 16 >> 16;
				if (k << 16 >> 16 > 0) {
					l = Za(e, 26525 + (d[26829 + o >> 0] | 0) | 0, 8) | 0;
					q = l & 65535;
					l = o - l & 65535;
					o = q << 16 >> 16;
					if (q << 16 >> 16 > 0) {
						n = Za(e, 26373 + (d[26829 + o >> 0] | 0) | 0, 8) | 0;
						m = n & 65535;
						n = o - n & 65535;
						q = f + ((r | 8) << 1) | 0;
						p = f + ((r | 9) << 1) | 0;
						o = m << 16 >> 16;
						if (m << 16 >> 16 > 0) {
							k = Za(e, 26221 + (d[26829 + o >> 0] | 0) | 0, 8) | 0;
							b[q >> 1] = k;
							m = n;
							q = o - k & 65535
						} else {
							o = l;
							t = 31
						}
					} else {
						o = l;
						t = 28
					}
				} else {
					o = 0;
					t = 28
				}
				if ((t | 0) == 28) {
					q = f + ((r | 8) << 1) | 0;
					p = f + ((r | 9) << 1) | 0;
					n = 0;
					t = 31
				}
				if ((t | 0) == 31) {
					t = 0;
					b[q >> 1] = 0;
					m = n;
					l = o;
					q = 0
				}
				b[p >> 1] = q;
				o = f + ((r | 10) << 1) | 0;
				n = m << 16 >> 16;
				if (m << 16 >> 16 > 0) {
					q = Za(e, 26221 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
					b[o >> 1] = q;
					o = n - q & 65535
				} else {
					b[o >> 1] = 0;
					o = 0
				}
				b[f + ((r | 11) << 1) >> 1] = o;
				o = l << 16 >> 16;
				if (l << 16 >> 16 > 0) {
					m = Za(e, 26373 + (d[26829 + o >> 0] | 0) | 0, 8) | 0;
					p = m & 65535;
					m = o - m & 65535;
					o = f + ((r | 12) << 1) | 0;
					n = f + ((r | 13) << 1) | 0;
					q = p << 16 >> 16;
					if (p << 16 >> 16 > 0) {
						p = Za(e, 26221 + (d[26829 + q >> 0] | 0) | 0, 8) | 0;
						b[o >> 1] = p;
						o = q - p & 65535
					} else t = 39
				} else {
					o = f + ((r | 12) << 1) | 0;
					n = f + ((r | 13) << 1) | 0;
					m = 0;
					t = 39
				}
				if ((t | 0) == 39) {
					t = 0;
					b[o >> 1] = 0;
					o = 0
				}
				b[n >> 1] = o;
				o = f + ((r | 14) << 1) | 0;
				n = m << 16 >> 16;
				if (m << 16 >> 16 > 0) {
					q = Za(e, 26221 + (d[26829 + n >> 0] | 0) | 0, 8) | 0;
					b[o >> 1] = q;
					o = n - q & 65535
				} else {
					b[o >> 1] = 0;
					o = 0
				}
				b[f + ((r | 15) << 1) >> 1] = o
			} else {
				n = o + 32 | 0;
				do {
					b[o >> 1] = 0;
					o = o + 2 | 0
				} while ((o | 0) < (n | 0))
			}
			s = s + 1 | 0
		}
		while (1) {
			if ((k | 0) >= (u | 0)) break;
			o = c[v + (k << 2) >> 2] | 0;
			if ((o | 0) > 0) {
				n = k << 16 >> 12;
				p = 0;
				while (1) {
					if ((p | 0) == 16) break;
					m = f + (n + p << 1) | 0;
					l = b[m >> 1] | 0;
					q = 0;
					while (1) {
						if ((q | 0) == (o | 0)) break;
						l = (l << 1) + (Za(e, 27139, 8) | 0) | 0;
						q = q + 1 | 0
					}
					b[m >> 1] = l;
					p = p + 1 | 0
				}
				s = x + (k << 2) | 0;
				c[s >> 2] = c[s >> 2] | o << 5
			}
			k = k + 1 | 0
		}
		a[w + 1 >> 0] = 0;
		o = ((g << 1) + h << 16 >> 16) * 7 | 0;
		n = j + 8 >> 4;
		m = 0;
		while (1) {
			if ((m | 0) >= (n | 0)) break;
			k = c[x + (m << 2) >> 2] | 0;
			a: do
				if ((k | 0) > 0) {
					a[w >> 0] = a[26846 + (o + ((k & 30) >>> 0 < 6 ? k & 31 : 6)) >> 0] | 0;
					l = 0;
					while (1) {
						if ((l | 0) == 16) break a;
						k = f + (l << 1) | 0;
						if ((b[k >> 1] | 0) > 0) {
							s = ((Za(e, w, 8) | 0) << 1) + -1 | 0;
							b[k >> 1] = _(b[k >> 1] | 0, s) | 0
						}
						l = l + 1 | 0
					}
				}
			while (0);
			f = f + 32 | 0;
			m = m + 1 | 0
		}
		i = y;
		return
	}

	function Ab(f, g, h, j, k, l, m, n) {
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0;
		V = i;
		i = i + 672 | 0;
		T = V + 16 | 0;
		U = V + 8 | 0;
		O = V;
		K = V + 24 | 0;
		P = l;
		p = O;
		c[p >> 2] = 0;
		c[p + 4 >> 2] = 0;
		p = g + 4 | 0;
		a: do
			if (!j) {
				R = p;
				j = c[p >> 2] | 0
			} else {
				o = 0;
				while (1) {
					j = c[p >> 2] | 0;
					if ((o | 0) >= (j | 0)) {
						R = p;
						break a
					}
					c[f + (o * 4260 | 0) + 2388 >> 2] = 0;
					o = o + 1 | 0
				}
			}
		while (0);
		S = f + 8536 | 0;
		if ((j | 0) > (c[S >> 2] | 0)) {
			vb(f + 4260 | 0);
			j = c[R >> 2] | 0
		}
		if ((j | 0) == 1 ? (c[S >> 2] | 0) == 2 : 0) Q = (c[g + 12 >> 2] | 0) == ((c[f + 2316 >> 2] | 0) * 1e3 | 0);
		else Q = 0;
		N = f + 2388 | 0;
		b: do
			if (!(c[N >> 2] | 0)) {
				F = g + 16 | 0;
				G = g + 12 | 0;
				H = g + 8 | 0;
				I = 0;
				E = 0;
				c: while (1) {
					if ((E | 0) >= (j | 0)) break b;
					switch (c[F >> 2] | 0) {
						case 0:
							{
								c[f + (E * 4260 | 0) + 2392 >> 2] = 1;c[f + (E * 4260 | 0) + 2324 >> 2] = 2;x = 2;
								break
							}
						case 10:
							{
								c[f + (E * 4260 | 0) + 2392 >> 2] = 1;c[f + (E * 4260 | 0) + 2324 >> 2] = 2;x = 2;
								break
							}
						case 20:
							{
								c[f + (E * 4260 | 0) + 2392 >> 2] = 1;c[f + (E * 4260 | 0) + 2324 >> 2] = 4;x = 4;
								break
							}
						case 40:
							{
								c[f + (E * 4260 | 0) + 2392 >> 2] = 2;c[f + (E * 4260 | 0) + 2324 >> 2] = 4;x = 4;
								break
							}
						case 60:
							{
								c[f + (E * 4260 | 0) + 2392 >> 2] = 3;c[f + (E * 4260 | 0) + 2324 >> 2] = 4;x = 4;
								break
							}
						default:
							{
								j = -203;J = 185;
								break c
							}
					}
					j = (c[G >> 2] >> 10) + 1 | 0;
					o = (j | 0) == 8;
					switch (j | 0) {
						case 8:
						case 12:
						case 16:
							break;
						default:
							{
								j = -200;J = 185;
								break c
							}
					}
					y = c[H >> 2] | 0;
					A = j << 16 >> 16;
					c[f + (E * 4260 | 0) + 2332 >> 2] = A * 5;
					B = _(x, A * 327680 >> 16) | 0;
					C = f + (E * 4260 | 0) + 2316 | 0;
					D = (c[C >> 2] | 0) == (j | 0);
					if (D ? (c[f + (E * 4260 | 0) + 2320 >> 2] | 0) == (y | 0) : 0) {
						q = 0;
						J = 46
					} else {
						z = A * 1e3 | 0;
						qc(f + (E * 4260 | 0) + 2432 | 0, 0, 300) | 0;
						d: do
							if ((z | 0) >= 12e3)
								if ((z | 0) < 16e3) switch (z | 0) {
									case 12e3:
										{
											J = 23;
											break d
										}
									default:
										{
											q = -1;
											break d
										}
								} else switch (z | 0) {
									case 16e3:
										{
											J = 23;
											break d
										}
									default:
										{
											q = -1;
											break d
										}
								} else switch (z | 0) {
									case 8e3:
										{
											J = 23;
											break
										}
									default:
										q = -1
								}
								while (0);
						e: do
							if ((J | 0) == 23) {
								f: do
									if ((y | 0) < 16e3)
										if ((y | 0) < 12e3) switch (y | 0) {
											case 8e3:
												break f;
											default:
												{
													q = -1;
													break e
												}
										} else switch (y | 0) {
											case 12e3:
												break f;
											default:
												{
													q = -1;
													break e
												}
										} else {
											if ((y | 0) < 24e3) switch (y | 0) {
												case 16e3:
													break f;
												default:
													{
														q = -1;
														break e
													}
											}
											if ((y | 0) < 48e3) switch (y | 0) {
												case 24e3:
													break f;
												default:
													{
														q = -1;
														break e
													}
											} else switch (y | 0) {
												case 48e3:
													break f;
												default:
													{
														q = -1;
														break e
													}
											}
										}
										while (0);c[f + (E * 4260 | 0) + 2724 >> 2] = a[((y >> 12) - ((y | 0) > 16e3 & 1) >> ((y | 0) > 24e3 & 1)) + -1 + (27124 + ((((z >> 12) - ((z | 0) > 16e3 & 1) >> ((z | 0) > 24e3 & 1)) + -1 | 0) * 5 | 0)) >> 0];c[f + (E * 4260 | 0) + 2716 >> 2] = A;c[f + (E * 4260 | 0) + 2720 >> 2] = (y | 0) / 1e3 | 0;c[f + (E * 4260 | 0) + 2700 >> 2] = A * 10;do
									if ((y | 0) > (z | 0)) {
										r = f + (E * 4260 | 0) + 2696 | 0;
										if ((y | 0) == (A * 2e3 | 0)) {
											c[r >> 2] = 1;
											u = 0;
											break
										} else {
											c[r >> 2] = 2;
											u = 1;
											break
										}
									} else {
										r = f + (E * 4260 | 0) + 2696 | 0;
										if ((y | 0) >= (z | 0)) {
											c[r >> 2] = 0;
											u = 0;
											break
										}
										c[r >> 2] = 3;
										q = y << 2;
										if ((q | 0) == (A * 3e3 | 0)) {
											c[f + (E * 4260 | 0) + 2712 >> 2] = 3;
											c[f + (E * 4260 | 0) + 2708 >> 2] = 18;
											c[f + (E * 4260 | 0) + 2728 >> 2] = 22132;
											u = 0;
											break
										}
										r = y * 3 | 0;
										if ((r | 0) == (A * 2e3 | 0)) {
											c[f + (E * 4260 | 0) + 2712 >> 2] = 2;
											c[f + (E * 4260 | 0) + 2708 >> 2] = 18;
											c[f + (E * 4260 | 0) + 2728 >> 2] = 22190;
											u = 0;
											break
										}
										if ((y << 1 | 0) == (z | 0)) {
											c[f + (E * 4260 | 0) + 2712 >> 2] = 1;
											c[f + (E * 4260 | 0) + 2708 >> 2] = 24;
											c[f + (E * 4260 | 0) + 2728 >> 2] = 22230;
											u = 0;
											break
										}
										if ((r | 0) == (z | 0)) {
											c[f + (E * 4260 | 0) + 2712 >> 2] = 1;
											c[f + (E * 4260 | 0) + 2708 >> 2] = 36;
											c[f + (E * 4260 | 0) + 2728 >> 2] = 22258;
											u = 0;
											break
										}
										if ((q | 0) == (z | 0)) {
											c[f + (E * 4260 | 0) + 2712 >> 2] = 1;
											c[f + (E * 4260 | 0) + 2708 >> 2] = 36;
											c[f + (E * 4260 | 0) + 2728 >> 2] = 22298;
											u = 0;
											break
										}
										if ((y * 6 | 0) != (z | 0)) {
											q = -1;
											break e
										}
										c[f + (E * 4260 | 0) + 2712 >> 2] = 1;
										c[f + (E * 4260 | 0) + 2708 >> 2] = 36;
										c[f + (E * 4260 | 0) + 2728 >> 2] = 22338;
										u = 0
									}
								while (0);
								s = ((z << (u | 14) | 0) / (y | 0) | 0) << 2;w = f + (E * 4260 | 0) + 2704 | 0;c[w >> 2] = s;v = y << 16 >> 16;r = (y >> 15) + 1 >> 1;t = z << u;
								while (1) {
									if (((_(s >> 16, v) | 0) + ((_(s & 65535, v) | 0) >> 16) + (_(s, r) | 0) | 0) >= (t | 0)) {
										q = 0;
										break e
									}
									z = s + 1 | 0;
									c[w >> 2] = z;
									s = z
								}
							}
						while (0);
						c[f + (E * 4260 | 0) + 2320 >> 2] = y;
						if (D) J = 46;
						else J = 47
					}
					if ((J | 0) == 46) {
						J = 0;
						if ((B | 0) != (c[f + (E * 4260 | 0) + 2328 >> 2] | 0)) J = 47
					}
					if ((J | 0) == 47) {
						J = 0;
						r = (x | 0) == 4;
						p = f + (E * 4260 | 0) + 2384 | 0;
						do
							if (o)
								if (r) {
									c[p >> 2] = 25997;
									break
								} else {
									c[p >> 2] = 26020;
									break
								}
						else
						if (r) {
							c[p >> 2] = 25963;
							break
						} else {
							c[p >> 2] = 26008;
							break
						}
						while (0);
						if (!D) {
							c[f + (E * 4260 | 0) + 2336 >> 2] = A * 20;
							switch (j | 0) {
								case 8:
								case 12:
									{
										c[f + (E * 4260 | 0) + 2340 >> 2] = 10;c[f + (E * 4260 | 0) + 2732 >> 2] = 18772;
										if ((j | 0) == 12) c[f + (E * 4260 | 0) + 2380 >> 2] = 25879;
										else J = 60;
										break
									}
								default:
									{
										c[f + (E * 4260 | 0) + 2340 >> 2] = 16;c[f + (E * 4260 | 0) + 2732 >> 2] = 18808;
										if ((j | 0) == 16) c[f + (E * 4260 | 0) + 2380 >> 2] = 25885;
										else J = 60
									}
							}
							if ((J | 0) == 60 ? (J = 0, o) : 0) c[f + (E * 4260 | 0) + 2380 >> 2] = 25870;
							c[f + (E * 4260 | 0) + 2376 >> 2] = 1;
							c[f + (E * 4260 | 0) + 2308 >> 2] = 100;
							a[f + (E * 4260 | 0) + 2312 >> 0] = 10;
							c[f + (E * 4260 | 0) + 4164 >> 2] = 0;
							qc(f + (E * 4260 | 0) + 1284 | 0, 0, 1024) | 0
						}
						c[C >> 2] = j;
						c[f + (E * 4260 | 0) + 2328 >> 2] = B
					}
					j = c[R >> 2] | 0;
					I = I + q | 0;
					E = E + 1 | 0
				}
				if ((J | 0) == 185) {
					i = V;
					return j | 0
				}
			} else I = 0;
		while (0);
		p = c[g >> 2] | 0;
		do
			if ((p | 0) == 2)
				if ((j | 0) == 2) {
					if ((c[f + 8532 >> 2] | 0) != 1 ? (c[S >> 2] | 0) != 1 : 0) {
						p = 2;
						break
					}
					p = f + 8520 | 0;
					b[p >> 1] = 0;
					b[p + 2 >> 1] = 0 >>> 16;
					p = f + 8528 | 0;
					b[p >> 1] = 0;
					b[p + 2 >> 1] = 0 >>> 16;
					tc(f + 6692 | 0, f + 2432 | 0, 300) | 0;
					p = c[g >> 2] | 0
				} else p = 2;
		while (0);
		c[f + 8532 >> 2] = p;
		c[S >> 2] = c[R >> 2];
		L = g + 8 | 0;
		H = c[L >> 2] | 0;
		if ((H | 0) > 48e3 | (H | 0) < 8e3) {
			I = -200;
			i = V;
			return I | 0
		}
		M = (h | 0) == 1;
		g: do
			if (!M ? (c[N >> 2] | 0) == 0 : 0) {
				E = k + 28 | 0;
				C = k + 32 | 0;
				B = k + 28 | 0;
				A = k + 20 | 0;
				x = k + 40 | 0;
				j = k + 24 | 0;
				o = k + 4 | 0;
				q = k + 32 | 0;
				H = 0;
				while (1) {
					p = c[R >> 2] | 0;
					if ((H | 0) >= (p | 0)) {
						j = 0;
						break
					}
					z = f + (H * 4260 | 0) + 2392 | 0;
					y = 0;
					while (1) {
						w = c[E >> 2] | 0;
						v = c[C >> 2] | 0;
						r = w >>> 1;
						u = v >>> 0 < r >>> 0;
						D = u & 1;
						if ((y | 0) >= (c[z >> 2] | 0)) break;
						if (!u) {
							c[q >> 2] = v - r;
							r = w - r | 0
						}
						c[B >> 2] = r;
						while (1) {
							if (r >>> 0 >= 8388609) break;
							c[A >> 2] = (c[A >> 2] | 0) + 8;
							r = r << 8;
							c[B >> 2] = r;
							w = c[x >> 2] | 0;
							u = c[j >> 2] | 0;
							if (u >>> 0 < (c[o >> 2] | 0) >>> 0) {
								c[j >> 2] = u + 1;
								u = d[(c[k >> 2] | 0) + u >> 0] | 0
							} else u = 0;
							c[x >> 2] = u;
							c[q >> 2] = ((w << 8 | u) >>> 1 & 255 | c[q >> 2] << 8 & 2147483392) ^ 255
						}
						c[f + (H * 4260 | 0) + 2404 + (y << 2) >> 2] = D;
						y = y + 1 | 0
					}
					if (!u) {
						c[q >> 2] = v - r;
						r = w - r | 0
					}
					c[B >> 2] = r;
					while (1) {
						if (r >>> 0 >= 8388609) break;
						c[A >> 2] = (c[A >> 2] | 0) + 8;
						r = r << 8;
						c[B >> 2] = r;
						s = c[x >> 2] | 0;
						t = c[j >> 2] | 0;
						if (t >>> 0 < (c[o >> 2] | 0) >>> 0) {
							c[j >> 2] = t + 1;
							t = d[(c[k >> 2] | 0) + t >> 0] | 0
						} else t = 0;
						c[x >> 2] = t;
						c[q >> 2] = ((s << 8 | t) >>> 1 & 255 | c[q >> 2] << 8 & 2147483392) ^ 255
					}
					c[f + (H * 4260 | 0) + 2416 >> 2] = D;
					H = H + 1 | 0
				}
				while (1) {
					if ((j | 0) >= (p | 0)) break;
					H = f + (j * 4260 | 0) + 2420 | 0;
					c[H >> 2] = 0;
					c[H + 4 >> 2] = 0;
					c[H + 8 >> 2] = 0;
					h: do
						if (c[f + (j * 4260 | 0) + 2416 >> 2] | 0) {
							o = f + (j * 4260 | 0) + 2392 | 0;
							p = c[o >> 2] | 0;
							if ((p | 0) == 1) {
								c[f + (j * 4260 | 0) + 2420 >> 2] = 1;
								break
							}
							p = (Za(k, c[18844 + (p + -2 << 2) >> 2] | 0, 8) | 0) + 1 | 0;
							q = 0;
							while (1) {
								if ((q | 0) >= (c[o >> 2] | 0)) break h;
								c[f + (j * 4260 | 0) + 2420 + (q << 2) >> 2] = p >>> q & 1;
								q = q + 1 | 0
							}
						}
					while (0);
					p = c[R >> 2] | 0;
					j = j + 1 | 0
				}
				if (!h) {
					u = f + 2392 | 0;
					o = 0;
					j = 0;
					while (1) {
						if ((j | 0) >= (c[u >> 2] | 0)) break g;
						t = f + 6680 + (j << 2) | 0;
						s = j + -1 | 0;
						r = 0;
						while (1) {
							if ((r | 0) >= (p | 0)) break;
							if (c[f + (r * 4260 | 0) + 2420 + (j << 2) >> 2] | 0) {
								if ((p | 0) == 2 & (r | 0) == 0 ? (Qb(k, O), (c[t >> 2] | 0) == 0) : 0) o = Za(k, 25851, 8) | 0;
								if ((j | 0) > 0 ? (c[f + (r * 4260 | 0) + 2420 + (s << 2) >> 2] | 0) != 0 : 0) q = 2;
								else q = 0;
								yb(f + (r * 4260 | 0) | 0, k, j, 1, q);
								zb(k, K, a[f + (r * 4260 | 0) + 2765 >> 0] | 0, a[f + (r * 4260 | 0) + 2766 >> 0] | 0, c[f + (r * 4260 | 0) + 2328 >> 2] | 0);
								p = c[R >> 2] | 0
							}
							r = r + 1 | 0
						}
						j = j + 1 | 0
					}
				} else o = 0
			} else o = 0;
		while (0);
		p = c[R >> 2] | 0;
		if ((p | 0) == 2) {
			switch (h | 0) {
				case 0:
					{
						Qb(k, O);
						if (!(c[f + 6664 + (c[N >> 2] << 2) >> 2] | 0)) J = 121;
						else o = 0;
						break
					}
				case 2:
					{
						if ((c[f + 2420 + (c[N >> 2] << 2) >> 2] | 0) == 1) {
							Qb(k, O);
							if (!(c[f + 6680 + (c[N >> 2] << 2) >> 2] | 0)) J = 121;
							else o = 0
						} else {
							p = 0;
							J = 122
						}
						break
					}
				default:
					{
						p = 0;J = 122
					}
			}
			i: do
				if ((J | 0) == 121) o = Za(k, 25851, 8) | 0;
				else
			if ((J | 0) == 122)
				while (1) {
					if ((p | 0) == 2) break i;
					c[O + (p << 2) >> 2] = b[f + 8520 + (p << 1) >> 1];
					p = p + 1 | 0;
					J = 122
				}
			while (0);
			p = c[R >> 2] | 0;
			if ((p | 0) == 2)
				if ((o | 0) == 0 ? (c[f + 8540 >> 2] | 0) == 1 : 0) {
					qc(f + 5544 | 0, 0, 1024) | 0;
					c[f + 6568 >> 2] = 100;
					a[f + 6572 >> 0] = 10;
					c[f + 8424 >> 2] = 0;
					c[f + 6636 >> 2] = 1;
					p = c[R >> 2] | 0;
					D = o
				} else {
					p = 2;
					D = o
				}
			else D = o
		} else D = o;
		G = _(c[g + 12 >> 2] | 0, p) | 0;
		G = (G | 0) < (_(c[L >> 2] | 0, c[g >> 2] | 0) | 0);
		if (G) {
			E = na() | 0;
			c[U >> 2] = P;
			p = l + ((c[f + 2328 >> 2] | 0) + 2 << 1) | 0
		} else {
			H = _(p, (c[f + 2328 >> 2] | 0) + 2 | 0) | 0;
			E = na() | 0;
			p = i;
			i = i + ((1 * (H << 1) | 0) + 15 & -16) | 0;
			c[U >> 2] = p;
			p = p + ((c[f + 2328 >> 2] | 0) + 2 << 1) | 0
		}
		H = U + 4 | 0;
		c[H >> 2] = p;
		if (!h) {
			F = f + 8540 | 0;
			q = (D | 0) == 0 & 1
		} else {
			p = f + 8540 | 0;
			if (c[p >> 2] | 0)
				if ((c[R >> 2] | 0) == 2 & (h | 0) == 2) q = (c[f + 6680 + (c[f + 6648 >> 2] << 2) >> 2] | 0) == 1;
				else q = 0;
			else q = 1;
			F = p;
			q = q & 1
		}
		o = (h | 0) == 2;
		r = (q | 0) == 0;
		p = 0;
		while (1) {
			q = c[R >> 2] | 0;
			if ((p | 0) >= (q | 0)) break;
			if ((p | 0) == 0 | r ^ 1) {
				q = (c[N >> 2] | 0) - p | 0;
				do
					if ((q | 0) < 1) q = 0;
					else {
						if (o) {
							q = (c[f + (p * 4260 | 0) + 2420 + (q + -1 << 2) >> 2] | 0) != 0 ? 2 : 0;
							break
						}
						if ((p | 0) > 0 ? (c[F >> 2] | 0) != 0 : 0) {
							q = 1;
							break
						}
						q = 2
					}
				while (0);
				q = I + (xb(f + (p * 4260 | 0) | 0, k, (c[U + (p << 2) >> 2] | 0) + 4 | 0, T, h, q, n) | 0) | 0
			} else {
				qc((c[U + (p << 2) >> 2] | 0) + 4 | 0, 0, c[T >> 2] << 1 | 0) | 0;
				q = I
			}
			I = f + (p * 4260 | 0) + 2388 | 0;
			c[I >> 2] = (c[I >> 2] | 0) + 1;
			I = q;
			p = p + 1 | 0
		}
		j: do
			if ((c[g >> 2] | 0) == 2 & (q | 0) == 2) {
				u = f + 8520 | 0;
				x = c[U >> 2] | 0;
				z = c[H >> 2] | 0;
				r = f + 2316 | 0;
				q = c[r >> 2] | 0;
				y = c[T >> 2] | 0;
				v = f + 8524 | 0;
				v = e[v >> 1] | e[v + 2 >> 1] << 16;
				b[x >> 1] = v;
				b[x + 2 >> 1] = v >>> 16;
				v = z;
				j = f + 8528 | 0;
				s = e[j >> 1] | e[j + 2 >> 1] << 16;
				b[v >> 1] = s;
				b[v + 2 >> 1] = s >>> 16;
				v = f + 8524 | 0;
				s = x + (y << 1) | 0;
				s = e[s >> 1] | e[s + 2 >> 1] << 16;
				b[v >> 1] = s;
				b[v + 2 >> 1] = s >>> 16;
				v = z + (y << 1) | 0;
				v = e[v >> 1] | e[v + 2 >> 1] << 16;
				b[j >> 1] = v;
				b[j + 2 >> 1] = v >>> 16;
				j = b[u >> 1] | 0;
				v = f + 8522 | 0;
				s = b[v >> 1] | 0;
				q = q << 3;
				o = (65536 / (q | 0) | 0) << 16 >> 16;
				p = ((_((c[O >> 2] | 0) - (j & 65535) << 16 >> 16, o) | 0) >> 15) + 1 >> 1;
				w = O + 4 | 0;
				o = ((_((c[w >> 2] | 0) - (s & 65535) << 16 >> 16, o) | 0) >> 15) + 1 >> 1;
				j = j << 16 >> 16;
				s = s << 16 >> 16;
				t = 0;
				while (1) {
					if ((t | 0) >= (q | 0)) break;
					A = j + p | 0;
					B = s + o | 0;
					C = t + 1 | 0;
					N = b[x + (C << 1) >> 1] | 0;
					h = (b[x + (t << 1) >> 1] | 0) + (b[x + (t + 2 << 1) >> 1] | 0) + (N << 1) | 0;
					J = z + (C << 1) | 0;
					n = A << 16 >> 16;
					K = B << 16 >> 16;
					K = ((b[J >> 1] << 8) + ((_(h >> 7, n) | 0) + ((_(h << 9 & 65024, n) | 0) >> 16)) + ((_(N >> 5, K) | 0) + ((_(N << 11 & 63488, K) | 0) >> 16)) >> 7) + 1 >> 1;
					b[J >> 1] = (K | 0) > 32767 ? 32767 : (K | 0) < -32768 ? -32768 : K;
					j = A;
					s = B;
					t = C
				}
				p = c[O >> 2] << 16 >> 16;
				o = c[w >> 2] << 16 >> 16;
				while (1) {
					if ((q | 0) >= (y | 0)) break;
					C = q + 1 | 0;
					A = b[x + (C << 1) >> 1] | 0;
					j = (b[x + (q << 1) >> 1] | 0) + (b[x + (q + 2 << 1) >> 1] | 0) + (A << 1) | 0;
					B = z + (C << 1) | 0;
					A = ((b[B >> 1] << 8) + ((_(j >> 7, p) | 0) + ((_(j << 9 & 65024, p) | 0) >> 16)) + ((_(A >> 5, o) | 0) + ((_(A << 11 & 63488, o) | 0) >> 16)) >> 7) + 1 >> 1;
					b[B >> 1] = (A | 0) > 32767 ? 32767 : (A | 0) < -32768 ? -32768 : A;
					q = C
				}
				b[u >> 1] = c[O >> 2];
				b[v >> 1] = c[w >> 2];
				p = 0;
				while (1) {
					if ((p | 0) >= (y | 0)) break j;
					C = p + 1 | 0;
					j = x + (C << 1) | 0;
					q = b[j >> 1] | 0;
					B = z + (C << 1) | 0;
					A = b[B >> 1] | 0;
					o = q + A | 0;
					A = q - A | 0;
					b[j >> 1] = (o | 0) > 32767 ? 32767 : (o | 0) < -32768 ? -32768 : o;
					b[B >> 1] = (A | 0) > 32767 ? 32767 : (A | 0) < -32768 ? -32768 : A;
					p = C
				}
			} else {
				C = c[U >> 2] | 0;
				r = f + 8524 | 0;
				B = e[r >> 1] | e[r + 2 >> 1] << 16;
				b[C >> 1] = B;
				b[C + 2 >> 1] = B >>> 16;
				C = C + (c[T >> 2] << 1) | 0;
				C = e[C >> 1] | e[C + 2 >> 1] << 16;
				b[r >> 1] = C;
				b[r + 2 >> 1] = C >>> 16;
				r = f + 2316 | 0
			}
		while (0);
		o = _(c[T >> 2] | 0, c[L >> 2] | 0) | 0;
		o = (o | 0) / ((c[r >> 2] << 16 >> 16) * 1e3 | 0) | 0;
		c[m >> 2] = o;
		p = c[g >> 2] | 0;
		if ((p | 0) == 2) {
			C = i;
			i = i + ((1 * (o << 1) | 0) + 15 & -16) | 0;
			o = C
		} else o = P;
		if (G) {
			B = c[R >> 2] | 0;
			G = f + 2328 | 0;
			A = (_(B, (c[G >> 2] | 0) + 2 | 0) | 0) << 1;
			C = i;
			i = i + ((1 * A | 0) + 15 & -16) | 0;
			tc(C | 0, l | 0, (_(B, (c[G >> 2] | 0) + 2 | 0) | 0) << 1 | 0) | 0;
			c[U >> 2] = C;
			c[H >> 2] = C + ((c[G >> 2] | 0) + 2 << 1)
		}
		q = o;
		j = 0;
		while (1) {
			o = c[R >> 2] | 0;
			if ((j | 0) >= (((p | 0) < (o | 0) ? p : o) | 0)) break;
			Lb(f + (j * 4260 | 0) + 2432 | 0, q, (c[U + (j << 2) >> 2] | 0) + 2 | 0, c[T >> 2] | 0);
			p = c[g >> 2] | 0;
			if ((p | 0) == 2) {
				p = 0;
				while (1) {
					if ((p | 0) >= (c[m >> 2] | 0)) break;
					b[l + (j + (p << 1) << 1) >> 1] = b[q + (p << 1) >> 1] | 0;
					p = p + 1 | 0
				}
				p = c[g >> 2] | 0
			}
			j = j + 1 | 0
		}
		k: do
			if ((p | 0) == 2 & (o | 0) == 1) {
				if (!Q) {
					j = 0;
					while (1) {
						if ((j | 0) >= (c[m >> 2] | 0)) break k;
						H = j << 1;
						b[l + ((H | 1) << 1) >> 1] = b[l + (H << 1) >> 1] | 0;
						j = j + 1 | 0
					}
				}
				Lb(f + 6692 | 0, q, (c[U >> 2] | 0) + 2 | 0, c[T >> 2] | 0);
				j = 0;
				while (1) {
					if ((j | 0) >= (c[m >> 2] | 0)) break k;
					b[l + ((j << 1 | 1) << 1) >> 1] = b[q + (j << 1) >> 1] | 0;
					j = j + 1 | 0
				}
			}
		while (0);
		if ((c[f + 4164 >> 2] | 0) == 2) j = _(c[f + 2308 >> 2] | 0, c[18736 + ((c[r >> 2] | 0) + -8 >> 2 << 2) >> 2] | 0) | 0;
		else j = 0;
		c[g + 20 >> 2] = j;
		l: do
			if (M) {
				j = 0;
				while (1) {
					if ((j | 0) >= (c[S >> 2] | 0)) break l;
					a[f + (j * 4260 | 0) + 2312 >> 0] = 10;
					j = j + 1 | 0
				}
			} else c[F >> 2] = D;
		while (0);
		va(E | 0);
		i = V;
		return I | 0
	}

	function Bb(d, e, f, g, h) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		j = c[d + 2316 >> 2] | 0;
		i = d + 4248 | 0;
		if ((j | 0) != (c[i >> 2] | 0)) {
			c[d + 4168 >> 2] = c[d + 2328 >> 2] << 7;
			c[d + 4240 >> 2] = 65536;
			c[d + 4244 >> 2] = 65536;
			c[d + 4256 >> 2] = 20;
			c[d + 4252 >> 2] = 2;
			c[i >> 2] = j
		}
		if (g) {
			Cb(d, e, f, h);
			o = d + 4160 | 0;
			c[o >> 2] = (c[o >> 2] | 0) + 1;
			return
		}
		p = d + 4168 | 0;
		o = a[d + 2765 >> 0] | 0;
		c[d + 4164 >> 2] = o << 24 >> 24;
		a: do
			if (o << 24 >> 24 == 2) {
				f = d + 2324 | 0;
				g = d + 2332 | 0;
				n = d + 4172 | 0;
				l = c[g >> 2] | 0;
				m = c[f >> 2] | 0;
				j = 0;
				o = 0;
				while (1) {
					k = _(o, l) | 0;
					i = m + -1 | 0;
					if ((o | 0) == (m | 0) ? 1 : (k | 0) >= (c[e + (i << 2) >> 2] | 0)) break;
					else {
						h = 0;
						k = 0
					}
					while (1) {
						if ((h | 0) == 5) break;
						q = k + (b[e + 96 + (((i - o | 0) * 5 | 0) + h << 1) >> 1] | 0) | 0;
						h = h + 1 | 0;
						k = q
					}
					if ((k | 0) > (j | 0)) {
						j = e + 96 + ((m + 65535 - o << 16 >> 16) * 5 << 1) | 0;
						b[n >> 1] = b[j >> 1] | 0;
						b[n + 2 >> 1] = b[j + 2 >> 1] | 0;
						b[n + 4 >> 1] = b[j + 4 >> 1] | 0;
						b[n + 6 >> 1] = b[j + 6 >> 1] | 0;
						b[n + 8 >> 1] = b[j + 8 >> 1] | 0;
						c[p >> 2] = c[e + (i - o << 2) >> 2] << 8;
						j = k
					}
					o = o + 1 | 0
				}
				b[n >> 1] = 0;
				b[n + 2 >> 1] = 0;
				b[n + 4 >> 1] = 0;
				b[n + 6 >> 1] = 0;
				b[n + 8 >> 1] = 0;
				b[d + 4176 >> 1] = j;
				if ((j | 0) < 11469) {
					h = (11744256 / (((j | 0) > 1 ? j : 1) | 0) | 0) << 16 >> 16;
					i = 0;
					while (1) {
						if ((i | 0) == 5) break a;
						o = d + 4172 + (i << 1) | 0;
						b[o >> 1] = (_(b[o >> 1] | 0, h) | 0) >>> 10;
						i = i + 1 | 0
					}
				}
				if ((j | 0) > 15565) {
					h = (255016960 / (j | 0) | 0) << 16 >> 16;
					i = 0;
					while (1) {
						if ((i | 0) == 5) break a;
						o = d + 4172 + (i << 1) | 0;
						b[o >> 1] = (_(b[o >> 1] | 0, h) | 0) >>> 14;
						i = i + 1 | 0
					}
				}
			} else {
				c[p >> 2] = (j << 16 >> 16) * 4608;
				f = d + 4172 | 0;
				b[f >> 1] = 0;
				b[f + 2 >> 1] = 0;
				b[f + 4 >> 1] = 0;
				b[f + 6 >> 1] = 0;
				b[f + 8 >> 1] = 0;
				f = d + 2324 | 0;
				g = d + 2332 | 0
			}
		while (0);
		tc(d + 4182 | 0, e + 64 | 0, c[d + 2340 >> 2] << 1 | 0) | 0;
		b[d + 4236 >> 1] = c[e + 136 >> 2];
		o = c[f >> 2] | 0;
		l = e + 16 + (o + -2 << 2) | 0;
		m = c[l + 4 >> 2] | 0;
		n = d + 4240 | 0;
		c[n >> 2] = c[l >> 2];
		c[n + 4 >> 2] = m;
		c[d + 4256 >> 2] = c[g >> 2];
		c[d + 4252 >> 2] = o;
		return
	}

	function Cb(a, d, f, g) {
		a = a | 0;
		d = d | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0;
		R = i;
		i = i + 64 | 0;
		l = R + 20 | 0;
		m = R + 16 | 0;
		j = R + 12 | 0;
		k = R + 8 | 0;
		Q = R + 24 | 0;
		h = R;
		I = a + 2336 | 0;
		A = c[I >> 2] | 0;
		O = a + 2328 | 0;
		P = i;
		i = i + ((1 * (A + (c[O >> 2] | 0) << 2) | 0) + 15 & -16) | 0;
		q = i;
		i = i + ((1 * (A << 1) | 0) + 15 & -16) | 0;
		c[h >> 2] = c[a + 4240 >> 2] >> 6;
		A = a + 4244 | 0;
		M = c[A >> 2] | 0;
		K = M >> 6;
		c[h + 4 >> 2] = K;
		if (c[a + 2376 >> 2] | 0) {
			p = a + 4182 | 0;
			o = p + 32 | 0;
			do {
				b[p >> 1] = 0;
				p = p + 2 | 0
			} while ((p | 0) < (o | 0))
		}
		G = a + 2332 | 0;
		H = a + 2324 | 0;
		Db(j, l, k, m, a + 4 | 0, h, c[G >> 2] | 0, c[H >> 2] | 0);
		h = c[a + 4252 >> 2] | 0;
		if ((c[j >> 2] >> c[m >> 2] | 0) < (c[k >> 2] >> c[l >> 2] | 0)) {
			E = _(h + -1 | 0, c[a + 4256 >> 2] | 0) | 0;
			E = (E | 0) < 128 ? 0 : E + -128 | 0
		} else {
			E = _(h, c[a + 4256 >> 2] | 0) | 0;
			E = (E | 0) < 128 ? 0 : E + -128 | 0
		}
		F = a + 4172 | 0;
		N = a + 4224 | 0;
		n = b[N >> 1] | 0;
		l = a + 4160 | 0;
		h = c[l >> 2] | 0;
		C = (h | 0) > 1;
		D = b[21760 + ((C ? 1 : h) << 1) >> 1] | 0;
		k = a + 4164 | 0;
		h = C ? 1 : h;
		if ((c[k >> 2] | 0) == 2) h = b[21764 + (h << 1) >> 1] | 0;
		else h = b[21768 + (h << 1) >> 1] | 0;
		p = h << 16 >> 16;
		m = a + 4182 | 0;
		L = a + 2340 | 0;
		Gb(m, c[L >> 2] | 0, 64881);
		j = c[L >> 2] | 0;
		tc(Q | 0, a + 4182 | 0, j << 1 | 0) | 0;
		do
			if (!(c[l >> 2] | 0)) {
				if ((c[k >> 2] | 0) == 2) {
					l = 16384;
					m = 0;
					while (1) {
						if ((m | 0) == 5) break;
						l = (l & 65535) - (e[a + 4172 + (m << 1) >> 1] | 0) & 65535;
						m = m + 1 | 0
					}
					x = p;
					n = (_(l << 16 >> 16 < 3277 ? 3277 : l << 16 >> 16, b[a + 4236 >> 1] | 0) | 0) >>> 14 & 65535;
					break
				}
				h = Ib(m, j) | 0;
				if ((h | 0) <= 134217728)
					if ((h | 0) < 4194304) h = 4194304;
					else v = 16;
				else {
					h = 134217728;
					v = 16
				}
				x = h << 3;
				x = (_(x >> 16, p) | 0) + ((_(x & 65528, p) | 0) >> 16) >> 14;
				j = c[L >> 2] | 0;
				n = 16384
			} else x = p;
		while (0);
		J = a + 4220 | 0;
		w = c[J >> 2] | 0;
		r = a + 4168 | 0;
		y = (c[r >> 2] >> 7) + 1 >> 1;
		z = c[I >> 2] | 0;
		B = z - y - j + -2 | 0;
		Hb(q + (B << 1) | 0, a + 1348 + (B << 1) | 0, Q, z - B | 0, j, g);
		l = c[A >> 2] | 0;
		if ((l | 0) <= 0) {
			m = 0 - l | 0;
			if (!m) m = 32;
			else v = 20
		} else {
			m = l;
			v = 20
		}
		if ((v | 0) == 20) m = aa(m | 0) | 0;
		l = l << m + -1;
		g = l >> 16;
		p = 536870911 / (g | 0) | 0;
		A = p << 16;
		C = A >> 16;
		l = 536870912 - ((_(g, C) | 0) + ((_(l & 65535, C) | 0) >> 16)) << 3;
		p = A + ((_(l >> 16, C) | 0) + ((_(l & 65528, C) | 0) >> 16)) + (_(l, (p >> 15) + 1 >> 1) | 0) | 0;
		m = 62 - m | 0;
		l = m + -46 | 0;
		if ((l | 0) >= 1)
			if ((l | 0) < 32) {
				m = p >> l;
				v = 30
			} else {
				m = 0;
				v = 31
			}
		else {
			k = 46 - m | 0;
			l = -2147483648 >> k;
			m = 2147483647 >>> k;
			if ((l | 0) > (m | 0))
				if ((p | 0) > (l | 0)) m = l;
				else m = (p | 0) < (m | 0) ? m : p;
			else if ((p | 0) <= (m | 0)) m = (p | 0) < (l | 0) ? l : p;
			m = m << k;
			v = 30
		}
		if ((v | 0) == 30)
			if ((m | 0) < 1073741823) v = 31;
			else m = 1073741823;
		k = c[I >> 2] | 0;
		j = m >> 16;
		l = m & 65535;
		m = B + (c[L >> 2] | 0) | 0;
		while (1) {
			if ((m | 0) >= (k | 0)) break;
			C = b[q + (m << 1) >> 1] | 0;
			c[P + (m << 2) >> 2] = (_(j, C) | 0) + ((_(l, C) | 0) >> 16);
			m = m + 1 | 0
		}
		s = a + 4174 | 0;
		h = a + 4176 | 0;
		j = a + 4178 | 0;
		k = a + 4180 | 0;
		t = D << 16 >> 16;
		B = x << 16 >> 16;
		A = a + 2316 | 0;
		D = y;
		C = w;
		u = 0;
		while (1) {
			if ((u | 0) >= (c[H >> 2] | 0)) break;
			x = n << 16 >> 16;
			y = c[G >> 2] | 0;
			v = (y | 0) > 0 ? y : 0;
			g = P + (z - D + 2 << 2) | 0;
			w = C;
			p = z;
			o = 0;
			while (1) {
				if ((o | 0) >= (y | 0)) {
					n = 0;
					break
				}
				C = c[g >> 2] | 0;
				m = b[F >> 1] | 0;
				m = (_(C >> 16, m) | 0) + ((_(C & 65535, m) | 0) >> 16) + 2 | 0;
				C = c[g + -4 >> 2] | 0;
				l = b[s >> 1] | 0;
				l = m + ((_(C >> 16, l) | 0) + ((_(C & 65535, l) | 0) >> 16)) | 0;
				C = c[g + -8 >> 2] | 0;
				m = b[h >> 1] | 0;
				m = l + ((_(C >> 16, m) | 0) + ((_(C & 65535, m) | 0) >> 16)) | 0;
				C = c[g + -12 >> 2] | 0;
				l = b[j >> 1] | 0;
				l = m + ((_(C >> 16, l) | 0) + ((_(C & 65535, l) | 0) >> 16)) | 0;
				C = c[g + -16 >> 2] | 0;
				m = b[k >> 1] | 0;
				m = l + ((_(C >> 16, m) | 0) + ((_(C & 65535, m) | 0) >> 16)) | 0;
				C = (_(w, 196314165) | 0) + 907633515 | 0;
				l = c[a + 4 + (E + (C >>> 25) << 2) >> 2] | 0;
				c[P + (p << 2) >> 2] = m + ((_(l >> 16, x) | 0) + ((_(l & 65535, x) | 0) >> 16)) << 2;
				g = g + 4 | 0;
				w = C;
				p = p + 1 | 0;
				o = o + 1 | 0
			}
			while (1) {
				if ((n | 0) == 5) break;
				C = a + 4172 + (n << 1) | 0;
				b[C >> 1] = (_(t, b[C >> 1] | 0) | 0) >>> 15;
				n = n + 1 | 0
			}
			n = (_(x, B) | 0) >>> 15 & 65535;
			C = c[r >> 2] | 0;
			C = C + (((C >> 16) * 655 | 0) + (((C & 65535) * 655 | 0) >>> 16)) | 0;
			c[r >> 2] = C;
			D = (c[A >> 2] << 16 >> 16) * 4608 | 0;
			D = (C | 0) < (D | 0) ? C : D;
			c[r >> 2] = D;
			D = (D >> 7) + 1 >> 1;
			C = w;
			z = z + v | 0;
			u = u + 1 | 0
		}
		A = c[I >> 2] | 0;
		B = A + -16 | 0;
		z = a + 1284 | 0;
		p = P + (B << 2) | 0;
		h = z;
		o = p + 64 | 0;
		do {
			c[p >> 2] = c[h >> 2];
			p = p + 4 | 0;
			h = h + 4 | 0
		} while ((p | 0) < (o | 0));
		q = b[Q >> 1] | 0;
		r = b[Q + 2 >> 1] | 0;
		s = b[Q + 4 >> 1] | 0;
		t = b[Q + 6 >> 1] | 0;
		u = b[Q + 8 >> 1] | 0;
		v = b[Q + 10 >> 1] | 0;
		w = b[Q + 12 >> 1] | 0;
		x = b[Q + 14 >> 1] | 0;
		y = b[Q + 16 >> 1] | 0;
		g = b[Q + 18 >> 1] | 0;
		h = K << 16 >> 16;
		p = (M >> 21) + 1 >> 1;
		j = 0;
		while (1) {
			m = c[O >> 2] | 0;
			if ((j | 0) >= (m | 0)) break;
			o = c[P + (B + (j + 15) << 2) >> 2] | 0;
			o = (c[L >> 2] >> 1) + ((_(o >> 16, q) | 0) + ((_(o & 65535, q) | 0) >> 16)) | 0;
			l = c[P + (B + (j + 14) << 2) >> 2] | 0;
			l = o + ((_(l >> 16, r) | 0) + ((_(l & 65535, r) | 0) >> 16)) | 0;
			o = c[P + (B + (j + 13) << 2) >> 2] | 0;
			o = l + ((_(o >> 16, s) | 0) + ((_(o & 65535, s) | 0) >> 16)) | 0;
			l = c[P + (B + (j + 12) << 2) >> 2] | 0;
			l = o + ((_(l >> 16, t) | 0) + ((_(l & 65535, t) | 0) >> 16)) | 0;
			o = c[P + (B + (j + 11) << 2) >> 2] | 0;
			o = l + ((_(o >> 16, u) | 0) + ((_(o & 65535, u) | 0) >> 16)) | 0;
			l = c[P + (B + (j + 10) << 2) >> 2] | 0;
			l = o + ((_(l >> 16, v) | 0) + ((_(l & 65535, v) | 0) >> 16)) | 0;
			o = c[P + (B + (j + 9) << 2) >> 2] | 0;
			o = l + ((_(o >> 16, w) | 0) + ((_(o & 65535, w) | 0) >> 16)) | 0;
			l = c[P + (B + (j + 8) << 2) >> 2] | 0;
			l = o + ((_(l >> 16, x) | 0) + ((_(l & 65535, x) | 0) >> 16)) | 0;
			o = c[P + (B + (j + 7) << 2) >> 2] | 0;
			o = l + ((_(o >> 16, y) | 0) + ((_(o & 65535, y) | 0) >> 16)) | 0;
			l = c[P + (B + (j + 6) << 2) >> 2] | 0;
			l = o + ((_(l >> 16, g) | 0) + ((_(l & 65535, g) | 0) >> 16)) | 0;
			o = c[L >> 2] | 0;
			m = j + 16 | 0;
			k = 10;
			while (1) {
				if ((k | 0) >= (o | 0)) break;
				F = c[P + (B + (m - k + -1) << 2) >> 2] | 0;
				E = b[Q + (k << 1) >> 1] | 0;
				l = l + ((_(F >> 16, E) | 0) + ((_(F & 65535, E) | 0) >> 16)) | 0;
				k = k + 1 | 0
			}
			m = P + (A + j << 2) | 0;
			k = (c[m >> 2] | 0) + (l << 4) | 0;
			c[m >> 2] = k;
			k = ((_(k >> 16, h) | 0) + ((_(k & 65535, h) | 0) >> 16) + (_(k, p) | 0) >> 7) + 1 >> 1;
			b[f + (j << 1) >> 1] = (k | 0) > 32767 ? 32767 : (k | 0) < -32768 ? -32768 : k;
			j = j + 1 | 0
		}
		p = z;
		h = P + (B + m << 2) | 0;
		o = p + 64 | 0;
		do {
			c[p >> 2] = c[h >> 2];
			p = p + 4 | 0;
			h = h + 4 | 0
		} while ((p | 0) < (o | 0));
		c[J >> 2] = C;
		b[N >> 1] = n;
		h = 0;
		while (1) {
			if ((h | 0) == 4) break;
			c[d + (h << 2) >> 2] = D;
			h = h + 1 | 0
		}
		i = R;
		return
	}

	function Db(a, d, e, f, g, h, j, k) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		r = i;
		l = i;
		i = i + ((1 * (j << 1 << 1) | 0) + 15 & -16) | 0;
		o = l;
		p = 0;
		while (1) {
			if ((p | 0) == 2) break;
			m = _(p + k + -2 | 0, j) | 0;
			n = h + (p << 2) | 0;
			q = 0;
			while (1) {
				if ((q | 0) >= (j | 0)) break;
				t = c[g + (q + m << 2) >> 2] | 0;
				s = c[n >> 2] | 0;
				u = s << 16 >> 16;
				s = (_(t >> 16, u) | 0) + ((_(t & 65535, u) | 0) >> 16) + (_(t, (s >> 15) + 1 >> 1) | 0) >> 8;
				b[o + (q << 1) >> 1] = (s | 0) > 32767 ? 32767 : (s | 0) < -32768 ? -32768 : s;
				q = q + 1 | 0
			}
			o = o + (j << 1) | 0;
			p = p + 1 | 0
		}
		Pb(a, d, l, j);
		Pb(e, f, l + (j << 1) | 0, j);
		i = r;
		return
	}

	function Eb(d, e, f, g) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0;
		j = f + 2 | 0;
		h = b[j >> 1] | 0;
		g = (_(h << 16 >> 16, g) | 0) / 2 | 0;
		i = f + 16 | 0;
		g = (c[f + 20 >> 2] | 0) + g | 0;
		f = 0;
		while (1) {
			if ((f | 0) >= (h << 16 >> 16 | 0)) break;
			l = a[g >> 0] | 0;
			k = l & 255;
			b[d + (f << 1) >> 1] = (k >>> 1 & 7) * 9;
			a[e + f >> 0] = a[(c[i >> 2] | 0) + (f + ((b[j >> 1] | 0) + -1 & 0 - (k & 1))) >> 0] | 0;
			h = f | 1;
			b[d + (h << 1) >> 1] = ((l & 255) >>> 5 & 255) * 9;
			a[e + h >> 0] = a[(c[i >> 2] | 0) + (f + ((b[j >> 1] | 0) + -1 & 0 - (k >>> 4 & 1)) + 1) >> 0] | 0;
			h = b[j >> 1] | 0;
			g = g + 1 | 0;
			f = f + 2 | 0
		}
		return
	}

	function Fb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0;
		g = d + -65536 | 0;
		f = b + -1 | 0;
		e = 0;
		while (1) {
			b = d >> 16;
			if ((e | 0) >= (f | 0)) break;
			h = a + (e << 2) | 0;
			i = c[h >> 2] | 0;
			j = i << 16 >> 16;
			c[h >> 2] = (_(b, j) | 0) + ((_(d & 65535, j) | 0) >> 16) + (_(d, (i >> 15) + 1 >> 1) | 0);
			d = d + (((_(d, g) | 0) >> 15) + 1 >> 1) | 0;
			e = e + 1 | 0
		}
		e = a + (f << 2) | 0;
		f = c[e >> 2] | 0;
		g = f << 16 >> 16;
		c[e >> 2] = (_(b, g) | 0) + ((_(d & 65535, g) | 0) >> 16) + (_(d, (f >> 15) + 1 >> 1) | 0);
		return
	}

	function Gb(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		f = d + -65536 | 0;
		e = c + -1 | 0;
		c = d;
		d = 0;
		while (1) {
			if ((d | 0) >= (e | 0)) break;
			g = a + (d << 1) | 0;
			b[g >> 1] = (((_(c, b[g >> 1] | 0) | 0) >>> 15) + 1 | 0) >>> 1;
			c = c + (((_(c, f) | 0) >> 15) + 1 >> 1) | 0;
			d = d + 1 | 0
		}
		d = a + (e << 1) | 0;
		b[d >> 1] = (((_(c, b[d >> 1] | 0) | 0) >>> 15) + 1 | 0) >>> 1;
		return
	}

	function Hb(a, c, d, e, f, g) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		g = d + 2 | 0;
		h = d + 4 | 0;
		i = d + 6 | 0;
		j = d + 8 | 0;
		k = d + 10 | 0;
		n = f;
		while (1) {
			if ((n | 0) >= (e | 0)) break;
			l = n + -1 | 0;
			m = _(b[c + (l << 1) >> 1] | 0, b[d >> 1] | 0) | 0;
			m = m + (_(b[c + (n + -2 << 1) >> 1] | 0, b[g >> 1] | 0) | 0) | 0;
			m = m + (_(b[c + (n + -3 << 1) >> 1] | 0, b[h >> 1] | 0) | 0) | 0;
			m = m + (_(b[c + (n + -4 << 1) >> 1] | 0, b[i >> 1] | 0) | 0) | 0;
			m = m + (_(b[c + (n + -5 << 1) >> 1] | 0, b[j >> 1] | 0) | 0) | 0;
			m = m + (_(b[c + (n + -6 << 1) >> 1] | 0, b[k >> 1] | 0) | 0) | 0;
			o = 6;
			while (1) {
				if ((o | 0) >= (f | 0)) break;
				p = m + (_(b[c + (l - o << 1) >> 1] | 0, b[d + (o << 1) >> 1] | 0) | 0) | 0;
				m = p + (_(b[c + (l + ~o << 1) >> 1] | 0, b[d + ((o | 1) << 1) >> 1] | 0) | 0) | 0;
				o = o + 2 | 0
			}
			o = ((b[c + (n << 1) >> 1] << 12) - m >> 11) + 1 >> 1;
			b[a + (n << 1) >> 1] = (o | 0) > 32767 ? 32767 : (o | 0) < -32768 ? -32768 : o;
			n = n + 1 | 0
		}
		qc(a | 0, 0, f << 1 | 0) | 0;
		return
	}

	function Ib(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		s = i;
		i = i + 128 | 0;
		q = s;
		e = d & 1;
		f = 0;
		g = 0;
		while (1) {
			if ((g | 0) >= (d | 0)) break;
			m = b[a + (g << 1) >> 1] | 0;
			c[q + (e << 6) + (g << 2) >> 2] = m << 12;
			f = f + m | 0;
			g = g + 1 | 0
		}
		if ((f | 0) > 4095) {
			m = 0;
			i = s;
			return m | 0
		} else {
			k = 1073741824;
			j = 0;
			g = d
		}
		while (1) {
			p = g + -1 | 0;
			if ((g | 0) <= 1) break;
			a = c[q + (e << 6) + (p << 2) >> 2] | 0;
			if ((a | 0) > 16773022 | (a | 0) < -16773022) {
				e = 0;
				r = 30;
				break
			}
			n = 0 - (a << 7) | 0;
			o = ((n | 0) < 0) << 31 >> 31;
			Bc(n | 0, o | 0, n | 0, o | 0) | 0;
			l = 1073741824 - C | 0;
			if ((l | 0) <= 0) {
				g = 0 - l | 0;
				if (!g) {
					g = 30;
					f = 0
				} else {
					f = 32 - (aa(g | 0) | 0) | 0;
					g = f + 30 | 0
				}
				d = 0 - l | 0;
				if (!d) d = 32;
				else r = 12
			} else {
				g = 32 - (aa(l | 0) | 0) | 0;
				f = g;
				g = g + 30 | 0;
				d = l;
				r = 12
			}
			if ((r | 0) == 12) {
				r = 0;
				d = aa(d | 0) | 0
			}
			m = l << d + -1;
			u = m >> 16;
			h = 536870911 / (u | 0) | 0;
			t = h << 16;
			a = t >> 16;
			m = 536870912 - ((_(u, a) | 0) + ((_(m & 65535, a) | 0) >> 16)) << 3;
			h = t + ((_(m >> 16, a) | 0) + ((_(m & 65528, a) | 0) >> 16)) + (_(m, (h >> 15) + 1 >> 1) | 0) | 0;
			d = 62 - d - g | 0;
			if ((d | 0) < 1) {
				a = 0 - d | 0;
				g = -2147483648 >> a;
				d = 2147483647 >>> a;
				if ((g | 0) > (d | 0))
					if ((h | 0) > (g | 0)) d = g;
					else d = (h | 0) < (d | 0) ? d : h;
				else if ((h | 0) <= (d | 0)) d = (h | 0) < (g | 0) ? g : h;
				m = d << a
			} else m = (d | 0) < 32 ? h >> d : 0;
			h = Bc(k | 0, j | 0, l | 0, ((l | 0) < 0) << 31 >> 31 | 0) | 0;
			h = rc(h | 0, C | 0, 30) | 0;
			j = p & 1;
			k = (f | 0) == 1;
			l = ((m | 0) < 0) << 31 >> 31;
			f = f + -1 | 0;
			a = 0;
			while (1) {
				if ((p | 0) <= (a | 0)) break;
				g = c[q + (e << 6) + (a << 2) >> 2] | 0;
				d = c[q + (e << 6) + (p - a + -1 << 2) >> 2] | 0;
				d = Bc(d | 0, ((d | 0) < 0) << 31 >> 31 | 0, n | 0, o | 0) | 0;
				d = rc(d | 0, C | 0, 30) | 0;
				d = sc(d | 0, C | 0, 1, 0) | 0;
				d = rc(d | 0, C | 0, 1) | 0;
				d = g - d | 0;
				d = Bc(d | 0, ((d | 0) < 0) << 31 >> 31 | 0, m | 0, l | 0) | 0;
				g = C;
				if (k) {
					g = rc(d | 0, g | 0, 1) | 0;
					d = sc(g | 0, C | 0, d & 1 | 0, 0) | 0
				} else {
					d = pc(d | 0, g | 0, f | 0) | 0;
					d = sc(d | 0, C | 0, 1, 0) | 0;
					d = rc(d | 0, C | 0, 1) | 0
				}
				c[q + (j << 6) + (a << 2) >> 2] = d;
				a = a + 1 | 0
			}
			g = h & -4;
			e = j;
			k = g;
			j = ((g | 0) < 0) << 31 >> 31;
			g = p
		}
		if ((r | 0) == 30) {
			i = s;
			return e | 0
		}
		e = c[q + (e << 6) >> 2] | 0;
		if ((e | 0) > 16773022 | (e | 0) < -16773022) {
			m = 0;
			i = s;
			return m | 0
		}
		l = 0 - (e << 7) | 0;
		m = ((l | 0) < 0) << 31 >> 31;
		Bc(l | 0, m | 0, l | 0, m | 0) | 0;
		m = 1073741824 - C | 0;
		m = Bc(k | 0, j | 0, m | 0, ((m | 0) < 0) << 31 >> 31 | 0) | 0;
		m = rc(m | 0, C | 0, 30) | 0;
		m = m & -4;
		i = s;
		return m | 0
	}

	function Jb(a, e, f) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		n = i;
		i = i + 208 | 0;
		j = n + 136 | 0;
		k = n + 100 | 0;
		l = n + 64 | 0;
		m = n;
		h = (f | 0) == 16 ? 26888 : 26904;
		g = 0;
		while (1) {
			if ((g | 0) >= (f | 0)) break;
			p = b[e + (g << 1) >> 1] | 0;
			o = p >> 8;
			q = b[21874 + (o << 1) >> 1] | 0;
			o = ((q << 8) + (_((b[21874 + (o + 1 << 1) >> 1] | 0) - q | 0, p - (o << 8) | 0) | 0) >> 3) + 1 >> 1;
			c[j + (d[h + g >> 0] << 2) >> 2] = o;
			g = g + 1 | 0
		}
		h = f >> 1;
		Kb(k, j, h);
		Kb(l, j + 4 | 0, h);
		e = 0;
		while (1) {
			if ((e | 0) >= (h | 0)) break;
			j = e + 1 | 0;
			g = (c[k + (j << 2) >> 2] | 0) + (c[k + (e << 2) >> 2] | 0) | 0;
			o = (c[l + (j << 2) >> 2] | 0) - (c[l + (e << 2) >> 2] | 0) | 0;
			c[m + (e << 2) >> 2] = 0 - o - g;
			c[m + (f - e + -1 << 2) >> 2] = o - g;
			e = j
		}
		g = 0;
		j = 0;
		while (1) {
			if ((j | 0) < 10) {
				e = 0;
				h = 0
			} else break;
			while (1) {
				if ((h | 0) >= (f | 0)) break;
				l = c[m + (h << 2) >> 2] | 0;
				l = (l | 0) > 0 ? l : 0 - l | 0;
				k = (l | 0) > (e | 0);
				g = k ? h : g;
				e = k ? l : e;
				h = h + 1 | 0
			}
			e = (e >> 4) + 1 >> 1;
			if ((e | 0) <= 32767) break;
			l = (e | 0) < 163838 ? e : 163838;
			Fb(m, f, 65470 - (((l << 14) + -536854528 | 0) / ((_(l, g + 1 | 0) | 0) >> 2 | 0) | 0) | 0);
			j = j + 1 | 0
		}
		a: do
			if ((j | 0) == 10) {
				g = 0;
				while (1) {
					if ((g | 0) >= (f | 0)) {
						g = 0;
						break a
					}
					l = m + (g << 2) | 0;
					k = (c[l >> 2] >> 4) + 1 >> 1;
					k = (k | 0) > 32767 ? 32767 : (k | 0) < -32768 ? -32768 : k;
					b[a + (g << 1) >> 1] = k;
					c[l >> 2] = k << 16 >> 11;
					g = g + 1 | 0
				}
			} else {
				g = 0;
				while (1) {
					if ((g | 0) >= (f | 0)) {
						g = 0;
						break a
					}
					b[a + (g << 1) >> 1] = (((c[m + (g << 2) >> 2] | 0) >>> 4) + 1 | 0) >>> 1;
					g = g + 1 | 0
				}
			}
		while (0);
		while (1) {
			if ((g | 0) >= 16) {
				g = 24;
				break
			}
			if ((Ib(a, f) | 0) >= 107374) {
				g = 24;
				break
			}
			Fb(m, f, 65536 - (2 << g) | 0);
			e = 0;
			while (1) {
				if ((e | 0) >= (f | 0)) break;
				b[a + (e << 1) >> 1] = (((c[m + (e << 2) >> 2] | 0) >>> 4) + 1 | 0) >>> 1;
				e = e + 1 | 0
			}
			g = g + 1 | 0
		}
		if ((g | 0) == 24) {
			i = n;
			return
		}
	}

	function Kb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		c[a >> 2] = 65536;
		k = a + 4 | 0;
		j = 1;
		e = 0 - (c[b >> 2] | 0) | 0;
		while (1) {
			c[k >> 2] = e;
			if ((j | 0) >= (d | 0)) break;
			i = c[b + (j << 1 << 2) >> 2] | 0;
			h = c[a + (j + -1 << 2) >> 2] | 0;
			f = ((i | 0) < 0) << 31 >> 31;
			e = c[a + (j << 2) >> 2] | 0;
			e = Bc(i | 0, f | 0, e | 0, ((e | 0) < 0) << 31 >> 31 | 0) | 0;
			e = rc(e | 0, C | 0, 15) | 0;
			e = sc(e | 0, C | 0, 1, 0) | 0;
			e = rc(e | 0, C | 0, 1) | 0;
			g = j + 1 | 0;
			c[a + (g << 2) >> 2] = (h << 1) - e;
			e = j;
			while (1) {
				if ((e | 0) <= 1) break;
				j = c[a + (e + -2 << 2) >> 2] | 0;
				m = Bc(i | 0, f | 0, h | 0, ((h | 0) < 0) << 31 >> 31 | 0) | 0;
				m = rc(m | 0, C | 0, 15) | 0;
				m = sc(m | 0, C | 0, 1, 0) | 0;
				m = rc(m | 0, C | 0, 1) | 0;
				l = a + (e << 2) | 0;
				c[l >> 2] = (c[l >> 2] | 0) + (j - m);
				h = j;
				e = e + -1 | 0
			}
			j = g;
			e = (c[k >> 2] | 0) - i | 0
		}
		return
	}

	function Lb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0;
		f = a + 284 | 0;
		g = a + 292 | 0;
		i = c[g >> 2] | 0;
		h = (c[f >> 2] | 0) - i | 0;
		tc(a + 168 + (i << 1) | 0, d | 0, h << 1 | 0) | 0;
		switch (c[a + 264 >> 2] | 0) {
			case 1:
				{
					Ob(a, b, a + 168 | 0, c[a + 284 >> 2] | 0);Ob(a, b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) | 0);
					break
				}
			case 2:
				{
					Nb(a, b, a + 168 | 0, c[a + 284 >> 2] | 0);Nb(a, b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) | 0);
					break
				}
			case 3:
				{
					Mb(a, b, a + 168 | 0, c[a + 284 >> 2] | 0);Mb(a, b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) | 0);
					break
				}
			default:
				{
					tc(b | 0, a + 168 | 0, c[f >> 2] << 1 | 0) | 0;tc(b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) << 1 | 0) | 0
				}
		}
		f = c[g >> 2] | 0;
		tc(a + 168 | 0, d + (e - f << 1) | 0, f << 1 | 0) | 0;
		return
	}

	function Mb(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0;
		O = i;
		L = i;
		i = i + ((1 * ((c[a + 268 >> 2] | 0) + (c[a + 276 >> 2] | 0) << 2) | 0) + 15 & -16) | 0;
		M = a + 24 | 0;
		N = a + 276 | 0;
		tc(L | 0, M | 0, c[N >> 2] << 2 | 0) | 0;
		n = a + 296 | 0;
		o = c[n >> 2] | 0;
		p = o + 4 | 0;
		q = c[a + 272 >> 2] | 0;
		r = a + 268 | 0;
		s = a + 4 | 0;
		t = a + 280 | 0;
		u = o + 6 | 0;
		v = o + 8 | 0;
		w = o + 10 | 0;
		x = o + 12 | 0;
		y = o + 14 | 0;
		z = o + 16 | 0;
		A = o + 18 | 0;
		B = o + 20 | 0;
		C = o + 22 | 0;
		D = o + 24 | 0;
		E = o + 26 | 0;
		F = o + 28 | 0;
		G = o + 30 | 0;
		H = o + 32 | 0;
		I = o + 34 | 0;
		J = o + 36 | 0;
		K = o + 38 | 0;
		while (1) {
			m = c[r >> 2] | 0;
			m = (f | 0) < (m | 0) ? f : m;
			g = c[N >> 2] | 0;
			h = c[n >> 2] | 0;
			j = h + 2 | 0;
			k = 0;
			while (1) {
				if ((k | 0) >= (m | 0)) break;
				P = (c[a >> 2] | 0) + (b[e + (k << 1) >> 1] << 8) | 0;
				c[L + (g + k << 2) >> 2] = P;
				P = P << 2;
				Q = P >> 16;
				l = b[h >> 1] | 0;
				P = P & 65532;
				c[a >> 2] = (c[s >> 2] | 0) + ((_(Q, l) | 0) + ((_(P, l) | 0) >> 16));
				l = b[j >> 1] | 0;
				c[s >> 2] = (_(Q, l) | 0) + ((_(P, l) | 0) >> 16);
				k = k + 1 | 0
			}
			l = m << 16;
			g = c[t >> 2] | 0;
			a: do switch (c[N >> 2] | 0) {
					case 18:
						{
							h = g << 16 >> 16;j = g + -1 | 0;k = 0;
							while (1) {
								if ((k | 0) >= (l | 0)) break a;
								g = k >> 16;
								P = (_(k & 65535, h) | 0) >> 16;
								Q = P * 9 | 0;
								R = c[L + (g << 2) >> 2] | 0;
								T = b[o + (Q + 2 << 1) >> 1] | 0;
								T = (_(R >> 16, T) | 0) + ((_(R & 65535, T) | 0) >> 16) | 0;
								R = c[L + (g + 1 << 2) >> 2] | 0;
								S = b[o + (Q + 3 << 1) >> 1] | 0;
								S = T + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 2 << 2) >> 2] | 0;
								T = b[o + (Q + 4 << 1) >> 1] | 0;
								T = S + ((_(R >> 16, T) | 0) + ((_(R & 65535, T) | 0) >> 16)) | 0;
								R = c[L + (g + 3 << 2) >> 2] | 0;
								S = b[o + (Q + 5 << 1) >> 1] | 0;
								S = T + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 4 << 2) >> 2] | 0;
								T = b[o + (Q + 6 << 1) >> 1] | 0;
								T = S + ((_(R >> 16, T) | 0) + ((_(R & 65535, T) | 0) >> 16)) | 0;
								R = c[L + (g + 5 << 2) >> 2] | 0;
								S = b[o + (Q + 7 << 1) >> 1] | 0;
								S = T + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 6 << 2) >> 2] | 0;
								T = b[o + (Q + 8 << 1) >> 1] | 0;
								T = S + ((_(R >> 16, T) | 0) + ((_(R & 65535, T) | 0) >> 16)) | 0;
								R = c[L + (g + 7 << 2) >> 2] | 0;
								S = b[o + (Q + 9 << 1) >> 1] | 0;
								S = T + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 8 << 2) >> 2] | 0;
								Q = b[o + (Q + 10 << 1) >> 1] | 0;
								Q = S + ((_(R >> 16, Q) | 0) + ((_(R & 65535, Q) | 0) >> 16)) | 0;
								P = (j - P | 0) * 9 | 0;
								R = c[L + (g + 17 << 2) >> 2] | 0;
								S = b[o + (P + 2 << 1) >> 1] | 0;
								S = Q + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 16 << 2) >> 2] | 0;
								Q = b[o + (P + 3 << 1) >> 1] | 0;
								Q = S + ((_(R >> 16, Q) | 0) + ((_(R & 65535, Q) | 0) >> 16)) | 0;
								R = c[L + (g + 15 << 2) >> 2] | 0;
								S = b[o + (P + 4 << 1) >> 1] | 0;
								S = Q + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 14 << 2) >> 2] | 0;
								Q = b[o + (P + 5 << 1) >> 1] | 0;
								Q = S + ((_(R >> 16, Q) | 0) + ((_(R & 65535, Q) | 0) >> 16)) | 0;
								R = c[L + (g + 13 << 2) >> 2] | 0;
								S = b[o + (P + 6 << 1) >> 1] | 0;
								S = Q + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 12 << 2) >> 2] | 0;
								Q = b[o + (P + 7 << 1) >> 1] | 0;
								Q = S + ((_(R >> 16, Q) | 0) + ((_(R & 65535, Q) | 0) >> 16)) | 0;
								R = c[L + (g + 11 << 2) >> 2] | 0;
								S = b[o + (P + 8 << 1) >> 1] | 0;
								S = Q + ((_(R >> 16, S) | 0) + ((_(R & 65535, S) | 0) >> 16)) | 0;
								R = c[L + (g + 10 << 2) >> 2] | 0;
								Q = b[o + (P + 9 << 1) >> 1] | 0;
								Q = S + ((_(R >> 16, Q) | 0) + ((_(R & 65535, Q) | 0) >> 16)) | 0;
								g = c[L + (g + 9 << 2) >> 2] | 0;
								P = b[o + (P + 10 << 1) >> 1] | 0;
								P = (Q + ((_(g >> 16, P) | 0) + ((_(g & 65535, P) | 0) >> 16)) >> 5) + 1 >> 1;
								g = d;
								b[g >> 1] = (P | 0) > 32767 ? 32767 : (P | 0) < -32768 ? -32768 : P;
								d = g + 2 | 0;
								k = k + q | 0
							}
						}
					case 24:
						{
							g = 0;
							while (1) {
								if ((g | 0) >= (l | 0)) break a;
								h = g >> 16;
								j = (c[L + (h << 2) >> 2] | 0) + (c[L + (h + 23 << 2) >> 2] | 0) | 0;
								k = b[p >> 1] | 0;
								k = (_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16) | 0;
								j = (c[L + (h + 1 << 2) >> 2] | 0) + (c[L + (h + 22 << 2) >> 2] | 0) | 0;
								P = b[u >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 2 << 2) >> 2] | 0) + (c[L + (h + 21 << 2) >> 2] | 0) | 0;
								k = b[v >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 3 << 2) >> 2] | 0) + (c[L + (h + 20 << 2) >> 2] | 0) | 0;
								P = b[w >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 4 << 2) >> 2] | 0) + (c[L + (h + 19 << 2) >> 2] | 0) | 0;
								k = b[x >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 5 << 2) >> 2] | 0) + (c[L + (h + 18 << 2) >> 2] | 0) | 0;
								P = b[y >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 6 << 2) >> 2] | 0) + (c[L + (h + 17 << 2) >> 2] | 0) | 0;
								k = b[z >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 7 << 2) >> 2] | 0) + (c[L + (h + 16 << 2) >> 2] | 0) | 0;
								P = b[A >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 8 << 2) >> 2] | 0) + (c[L + (h + 15 << 2) >> 2] | 0) | 0;
								k = b[B >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 9 << 2) >> 2] | 0) + (c[L + (h + 14 << 2) >> 2] | 0) | 0;
								P = b[C >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 10 << 2) >> 2] | 0) + (c[L + (h + 13 << 2) >> 2] | 0) | 0;
								k = b[D >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								h = (c[L + (h + 11 << 2) >> 2] | 0) + (c[L + (h + 12 << 2) >> 2] | 0) | 0;
								j = b[E >> 1] | 0;
								j = (k + ((_(h >> 16, j) | 0) + ((_(h & 65535, j) | 0) >> 16)) >> 5) + 1 >> 1;
								h = d;
								b[h >> 1] = (j | 0) > 32767 ? 32767 : (j | 0) < -32768 ? -32768 : j;
								d = h + 2 | 0;
								g = g + q | 0
							}
						}
					case 36:
						{
							g = 0;
							while (1) {
								if ((g | 0) >= (l | 0)) break a;
								h = g >> 16;
								j = (c[L + (h << 2) >> 2] | 0) + (c[L + (h + 35 << 2) >> 2] | 0) | 0;
								k = b[p >> 1] | 0;
								k = (_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16) | 0;
								j = (c[L + (h + 1 << 2) >> 2] | 0) + (c[L + (h + 34 << 2) >> 2] | 0) | 0;
								P = b[u >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 2 << 2) >> 2] | 0) + (c[L + (h + 33 << 2) >> 2] | 0) | 0;
								k = b[v >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 3 << 2) >> 2] | 0) + (c[L + (h + 32 << 2) >> 2] | 0) | 0;
								P = b[w >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 4 << 2) >> 2] | 0) + (c[L + (h + 31 << 2) >> 2] | 0) | 0;
								k = b[x >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 5 << 2) >> 2] | 0) + (c[L + (h + 30 << 2) >> 2] | 0) | 0;
								P = b[y >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 6 << 2) >> 2] | 0) + (c[L + (h + 29 << 2) >> 2] | 0) | 0;
								k = b[z >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 7 << 2) >> 2] | 0) + (c[L + (h + 28 << 2) >> 2] | 0) | 0;
								P = b[A >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 8 << 2) >> 2] | 0) + (c[L + (h + 27 << 2) >> 2] | 0) | 0;
								k = b[B >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 9 << 2) >> 2] | 0) + (c[L + (h + 26 << 2) >> 2] | 0) | 0;
								P = b[C >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 10 << 2) >> 2] | 0) + (c[L + (h + 25 << 2) >> 2] | 0) | 0;
								k = b[D >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 11 << 2) >> 2] | 0) + (c[L + (h + 24 << 2) >> 2] | 0) | 0;
								P = b[E >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 12 << 2) >> 2] | 0) + (c[L + (h + 23 << 2) >> 2] | 0) | 0;
								k = b[F >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 13 << 2) >> 2] | 0) + (c[L + (h + 22 << 2) >> 2] | 0) | 0;
								P = b[G >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 14 << 2) >> 2] | 0) + (c[L + (h + 21 << 2) >> 2] | 0) | 0;
								k = b[H >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								j = (c[L + (h + 15 << 2) >> 2] | 0) + (c[L + (h + 20 << 2) >> 2] | 0) | 0;
								P = b[I >> 1] | 0;
								P = k + ((_(j >> 16, P) | 0) + ((_(j & 65535, P) | 0) >> 16)) | 0;
								j = (c[L + (h + 16 << 2) >> 2] | 0) + (c[L + (h + 19 << 2) >> 2] | 0) | 0;
								k = b[J >> 1] | 0;
								k = P + ((_(j >> 16, k) | 0) + ((_(j & 65535, k) | 0) >> 16)) | 0;
								h = (c[L + (h + 17 << 2) >> 2] | 0) + (c[L + (h + 18 << 2) >> 2] | 0) | 0;
								j = b[K >> 1] | 0;
								j = (k + ((_(h >> 16, j) | 0) + ((_(h & 65535, j) | 0) >> 16)) >> 5) + 1 >> 1;
								h = d;
								b[h >> 1] = (j | 0) > 32767 ? 32767 : (j | 0) < -32768 ? -32768 : j;
								d = h + 2 | 0;
								g = g + q | 0
							}
						}
					default:
						{}
				}
				while (0);
				f = f - m | 0;
			if ((f | 0) <= 1) break;
			tc(L | 0, L + (m << 2) | 0, c[N >> 2] << 2 | 0) | 0;
			e = e + (m << 1) | 0
		}
		tc(M | 0, L + (m << 2) | 0, c[N >> 2] << 2 | 0) | 0;
		i = O;
		return
	}

	function Nb(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0;
		p = i;
		l = i;
		i = i + ((1 * ((c[a + 268 >> 2] << 1) + 8 << 1) | 0) + 15 & -16) | 0;
		m = a + 24 | 0;
		b[l >> 1] = b[m >> 1] | 0;
		b[l + 2 >> 1] = b[m + 2 >> 1] | 0;
		b[l + 4 >> 1] = b[m + 4 >> 1] | 0;
		b[l + 6 >> 1] = b[m + 6 >> 1] | 0;
		b[l + 8 >> 1] = b[m + 8 >> 1] | 0;
		b[l + 10 >> 1] = b[m + 10 >> 1] | 0;
		b[l + 12 >> 1] = b[m + 12 >> 1] | 0;
		b[l + 14 >> 1] = b[m + 14 >> 1] | 0;
		n = c[a + 272 >> 2] | 0;
		o = a + 268 | 0;
		k = l + 16 | 0;
		while (1) {
			j = c[o >> 2] | 0;
			j = (f | 0) < (j | 0) ? f : j;
			Ob(a, k, e, j);
			h = j << 17;
			g = 0;
			while (1) {
				if ((g | 0) >= (h | 0)) break;
				r = ((g & 65535) * 12 | 0) >>> 16;
				q = g >> 16;
				s = _(b[l + (q << 1) >> 1] | 0, b[22378 + (r << 3) >> 1] | 0) | 0;
				s = s + (_(b[l + (q + 1 << 1) >> 1] | 0, b[22378 + (r << 3) + 2 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 2 << 1) >> 1] | 0, b[22378 + (r << 3) + 4 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 3 << 1) >> 1] | 0, b[22378 + (r << 3) + 6 >> 1] | 0) | 0) | 0;
				r = 11 - r | 0;
				s = s + (_(b[l + (q + 4 << 1) >> 1] | 0, b[22378 + (r << 3) + 6 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 5 << 1) >> 1] | 0, b[22378 + (r << 3) + 4 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 6 << 1) >> 1] | 0, b[22378 + (r << 3) + 2 >> 1] | 0) | 0) | 0;
				r = (s + (_(b[l + (q + 7 << 1) >> 1] | 0, b[22378 + (r << 3) >> 1] | 0) | 0) >> 14) + 1 >> 1;
				q = d;
				b[q >> 1] = (r | 0) > 32767 ? 32767 : (r | 0) < -32768 ? -32768 : r;
				d = q + 2 | 0;
				g = g + n | 0
			}
			f = f - j | 0;
			if ((f | 0) <= 0) break;
			h = l + (j << 1 << 1) | 0;
			b[l >> 1] = b[h >> 1] | 0;
			b[l + 2 >> 1] = b[h + 2 >> 1] | 0;
			b[l + 4 >> 1] = b[h + 4 >> 1] | 0;
			b[l + 6 >> 1] = b[h + 6 >> 1] | 0;
			b[l + 8 >> 1] = b[h + 8 >> 1] | 0;
			b[l + 10 >> 1] = b[h + 10 >> 1] | 0;
			b[l + 12 >> 1] = b[h + 12 >> 1] | 0;
			b[l + 14 >> 1] = b[h + 14 >> 1] | 0;
			e = e + (j << 1) | 0
		}
		n = l + (j << 1 << 1) | 0;
		b[m >> 1] = b[n >> 1] | 0;
		b[m + 2 >> 1] = b[n + 2 >> 1] | 0;
		b[m + 4 >> 1] = b[n + 4 >> 1] | 0;
		b[m + 6 >> 1] = b[n + 6 >> 1] | 0;
		b[m + 8 >> 1] = b[n + 8 >> 1] | 0;
		b[m + 10 >> 1] = b[n + 10 >> 1] | 0;
		b[m + 12 >> 1] = b[n + 12 >> 1] | 0;
		b[m + 14 >> 1] = b[n + 14 >> 1] | 0;
		i = p;
		return
	}

	function Ob(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		g = a + 4 | 0;
		h = a + 8 | 0;
		i = a + 12 | 0;
		j = a + 16 | 0;
		k = a + 20 | 0;
		l = 0;
		while (1) {
			if ((l | 0) >= (f | 0)) break;
			p = b[e + (l << 1) >> 1] << 10;
			n = c[a >> 2] | 0;
			m = p - n | 0;
			m = ((m >> 16) * 1746 | 0) + (((m & 65535) * 1746 | 0) >>> 16) | 0;
			n = n + m | 0;
			c[a >> 2] = p + m;
			m = c[g >> 2] | 0;
			o = n - m | 0;
			o = ((o >> 16) * 14986 | 0) + (((o & 65535) * 14986 | 0) >>> 16) | 0;
			m = m + o | 0;
			c[g >> 2] = n + o;
			o = m - (c[h >> 2] | 0) | 0;
			n = (_(o >> 16, -26453) | 0) + ((_(o & 65535, -26453) | 0) >> 16) | 0;
			c[h >> 2] = m + (o + n);
			n = (m + n >> 9) + 1 >> 1;
			m = l << 1;
			b[d + (m << 1) >> 1] = (n | 0) > 32767 ? 32767 : (n | 0) < -32768 ? -32768 : n;
			n = c[i >> 2] | 0;
			o = p - n | 0;
			o = ((o >> 16) * 6854 | 0) + (((o & 65535) * 6854 | 0) >>> 16) | 0;
			n = n + o | 0;
			c[i >> 2] = p + o;
			o = c[j >> 2] | 0;
			p = n - o | 0;
			p = ((p >> 16) * 25769 | 0) + (((p & 65535) * 25769 | 0) >>> 16) | 0;
			o = o + p | 0;
			c[j >> 2] = n + p;
			p = o - (c[k >> 2] | 0) | 0;
			n = (_(p >> 16, -9994) | 0) + ((_(p & 65535, -9994) | 0) >> 16) | 0;
			c[k >> 2] = o + (p + n);
			n = (o + n >> 9) + 1 >> 1;
			b[d + ((m | 1) << 1) >> 1] = (n | 0) > 32767 ? 32767 : (n | 0) < -32768 ? -32768 : n;
			l = l + 1 | 0
		}
		return
	}

	function Pb(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		k = f + -1 | 0;
		g = 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (k | 0)) {
				j = h;
				h = 0;
				break
			}
			j = b[e + (h << 1) >> 1] | 0;
			j = g + (_(j, j) | 0) | 0;
			g = b[e + ((h | 1) << 1) >> 1] | 0;
			g = j + (_(g, g) | 0) | 0;
			if ((g | 0) < 0) {
				i = 5;
				break
			}
			h = h + 2 | 0
		}
		if ((i | 0) == 5) {
			j = h + 2 | 0;
			g = g >>> 2;
			h = 2
		}
		i = f + -1 | 0;
		i = ((j | 0) > (i | 0) ? j : i) + 1 - j & -2;
		f = j;
		while (1) {
			if ((f | 0) >= (k | 0)) break;
			l = b[e + (f << 1) >> 1] | 0;
			l = _(l, l) | 0;
			m = b[e + (f + 1 << 1) >> 1] | 0;
			m = g + ((l + (_(m, m) | 0) | 0) >>> h) | 0;
			l = (m | 0) < 0;
			f = f + 2 | 0;
			g = l ? m >>> 2 : m;
			h = l ? h + 2 | 0 : h
		}
		if ((j + i | 0) != (k | 0)) {
			l = g;
			j = l >>> 0 > 1073741823;
			k = l >>> 2;
			e = h + 2 | 0;
			e = j ? e : h;
			l = j ? k : l;
			c[d >> 2] = e;
			c[a >> 2] = l;
			return
		}
		l = b[e + (k << 1) >> 1] | 0;
		l = g + ((_(l, l) | 0) >>> h) | 0;
		j = l >>> 0 > 1073741823;
		k = l >>> 2;
		e = h + 2 | 0;
		e = j ? e : h;
		l = j ? k : l;
		c[d >> 2] = e;
		c[a >> 2] = l;
		return
	}

	function Qb(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0;
		g = i;
		i = i + 32 | 0;
		f = g;
		h = Za(a, 25826, 8) | 0;
		e = (h | 0) / 5 | 0;
		c[f + 8 >> 2] = e;
		c[f + 20 >> 2] = h + (_(e, -5) | 0);
		e = 0;
		while (1) {
			if ((e | 0) == 2) {
				a = 0;
				break
			}
			c[f + (e * 12 | 0) >> 2] = Za(a, 25867, 8) | 0;
			c[f + (e * 12 | 0) + 4 >> 2] = Za(a, 25874, 8) | 0;
			e = e + 1 | 0
		}
		while (1) {
			if ((a | 0) == 2) break;
			h = f + (a * 12 | 0) | 0;
			e = (c[h >> 2] | 0) + ((c[f + (a * 12 | 0) + 8 >> 2] | 0) * 3 | 0) | 0;
			c[h >> 2] = e;
			h = b[21828 + (e << 1) >> 1] | 0;
			e = b[21828 + (e + 1 << 1) >> 1] | 0;
			e = (_((e << 16 >> 16) - h >> 16, 429522944) | 0) + (((e & 65535) - h & 65535) * 6554 | 0) >> 16;
			c[d + (a << 2) >> 2] = h + (_(e, c[f + (a * 12 | 0) + 4 >> 2] << 17 >> 16 | 1) | 0);
			a = a + 1 | 0
		}
		c[d >> 2] = (c[d >> 2] | 0) - (c[d + 4 >> 2] | 0);
		i = g;
		return
	}

	function Rb(b, c) {
		b = b | 0;
		c = c | 0;
		b = a[b >> 0] | 0;
		do
			if (b << 24 >> 24 >= 0)
				if ((b & 96) == 96)
					if (!(b & 8)) {
						b = (c | 0) / 100 | 0;
						break
					} else {
						b = (c | 0) / 50 | 0;
						break
					}
		else {
			b = (b & 255) >>> 3 & 3;
			if ((b | 0) == 3) {
				b = (c * 60 | 0) / 1e3 | 0;
				break
			} else {
				b = (c << b | 0) / 100 | 0;
				break
			}
		} else b = (c << ((b & 255) >>> 3 & 3) | 0) / 400 | 0;
		while (0);
		return b | 0
	}

	function Sb(a) {
		a = a | 0;
		var b = 0,
			d = 0;
		if ((a | 0) < 1 | (a | 0) > 2) {
			a = 0;
			return a | 0
		} else b = 0;
		a: while (1) {
			d = 0;
			while (1) {
				if ((d | 0) >= 4) break;
				if (!d) break a;
				d = d + 1 | 0
			}
			b = b + 1 | 0
		}
		b = c[6752 + (b << 2) >> 2] | 0;
		a = ((_((c[b + 4 >> 2] | 0) + 2048 | 0, a) | 0) << 2) + 84 + (a * 96 | 0) | 0;
		a = a + (c[b + 8 >> 2] << 5) + 8632 | 0;
		return a | 0
	}

	function Tb(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		p = i;
		i = i + 16 | 0;
		l = p + 8 | 0;
		k = p;
		a: do
			if ((a | 0) < 16e3)
				if ((a | 0) < 12e3) switch (a | 0) {
					case 8e3:
						{
							o = 2;
							break a
						}
					default:
						break a
				} else switch (a | 0) {
					case 12e3:
						{
							o = 2;
							break a
						}
					default:
						break a
				} else {
					if ((a | 0) < 24e3) switch (a | 0) {
						case 16e3:
							{
								o = 2;
								break a
							}
						default:
							break a
					}
					if ((a | 0) < 48e3) switch (a | 0) {
						case 24e3:
							{
								o = 2;
								break a
							}
						default:
							break a
					} else switch (a | 0) {
						case 48e3:
							{
								o = 2;
								break a
							}
						default:
							break a
					}
				}
				while (0);
		if ((o | 0) == 2 ? (f = (d | 0) == 1, (d + -1 | 0) >>> 0 < 2) : 0) {
			m = kc(Sb(d) | 0) | 0;
			n = m;
			if (!m) {
				if (!e) {
					n = 0;
					i = p;
					return n | 0
				}
				c[e >> 2] = -7;
				n = 0;
				i = p;
				return n | 0
			}
			b: do
				if ((a | 0) < 16e3)
					if ((a | 0) < 12e3) switch (a | 0) {
						case 8e3:
							{
								o = 9;
								break b
							}
						default:
							{
								f = -1;
								break b
							}
					} else switch (a | 0) {
						case 12e3:
							{
								o = 9;
								break b
							}
						default:
							{
								f = -1;
								break b
							}
					} else {
						if ((a | 0) < 24e3) switch (a | 0) {
							case 16e3:
								{
									o = 9;
									break b
								}
							default:
								{
									f = -1;
									break b
								}
						}
						if ((a | 0) < 48e3) switch (a | 0) {
							case 24e3:
								{
									o = 9;
									break b
								}
							default:
								{
									f = -1;
									break b
								}
						} else switch (a | 0) {
							case 48e3:
								{
									o = 9;
									break b
								}
							default:
								{
									f = -1;
									break b
								}
						}
					}
					while (0);
			do
				if ((o | 0) == 9) {
					qc(m | 0, 0, Sb(d) | 0) | 0;
					c[m + 4 >> 2] = 88;
					c[m >> 2] = 8632;
					g = c[m + 4 >> 2] | 0;
					f = m + g | 0;
					j = m + 8632 | 0;
					c[m + 8 >> 2] = d;
					c[m + 44 >> 2] = d;
					c[m + 12 >> 2] = a;
					c[m + 24 >> 2] = a;
					c[m + 16 >> 2] = d;
					h = 0;
					while (1) {
						if ((h | 0) == 2) break;
						vb(f + (h * 4260 | 0) | 0);
						h = h + 1 | 0
					}
					f = m + (g + 8520) | 0;
					b[f >> 1] = 0;
					b[f + 2 >> 1] = 0;
					b[f + 4 >> 1] = 0;
					b[f + 6 >> 1] = 0;
					b[f + 8 >> 1] = 0;
					b[f + 10 >> 1] = 0;
					c[m + (g + 8540) >> 2] = 0;
					f = 0;
					c: while (1) {
						if ((f | 0) < 1) g = 0;
						else {
							f = 0;
							break
						}
						while (1) {
							if ((g | 0) >= 4) break;
							if (!g) {
								o = 18;
								break c
							}
							g = g + 1 | 0
						}
						f = f + 1 | 0
					}
					if ((o | 0) == 18) f = c[6752 + (f << 2) >> 2] | 0;
					if (!((d | 0) < 0 | (d | 0) > 2)) {
						g = f;
						h = g + 4 | 0;
						o = ((_((c[h >> 2] | 0) + 2048 | 0, d) | 0) << 2) + 84 + (d * 96 | 0) | 0;
						qc(j | 0, 0, o + (c[g + 8 >> 2] << 5) | 0) | 0;
						c[j >> 2] = f;
						c[m + 8636 >> 2] = c[h >> 2];
						c[m + 8640 >> 2] = d;
						c[m + 8644 >> 2] = d;
						c[m + 8648 >> 2] = 1;
						c[m + 8652 >> 2] = 0;
						c[m + 8656 >> 2] = c[(c[j >> 2] | 0) + 12 >> 2];
						c[m + 8660 >> 2] = 1;
						c[m + 8664 >> 2] = 0;
						c[m + 8680 >> 2] = 0;
						Ua(j, 4028, k);
						d: do
							if ((a | 0) < 16e3)
								if ((a | 0) < 12e3) {
									switch (a | 0) {
										case 8e3:
											break;
										default:
											{
												o = 27;
												break d
											}
									}
									f = 6;
									o = 28;
									break
								} else {
									switch (a | 0) {
										case 12e3:
											break;
										default:
											{
												o = 27;
												break d
											}
									}
									f = 4;
									o = 28;
									break
								}
						else {
							if ((a | 0) < 24e3) {
								switch (a | 0) {
									case 16e3:
										break;
									default:
										{
											o = 27;
											break d
										}
								}
								f = 3;
								o = 28;
								break
							}
							if ((a | 0) >= 48e3) switch (a | 0) {
								case 48e3:
									{
										f = 1;o = 28;
										break d
									}
								default:
									{
										o = 27;
										break d
									}
							}
							switch (a | 0) {
								case 24e3:
									break;
								default:
									{
										o = 27;
										break d
									}
							}
							f = 2;
							o = 28
						}
						while (0);
						if ((o | 0) == 27) {
							c[m + 8648 >> 2] = 0;
							f = -3;
							break
						} else if ((o | 0) == 28) {
							c[m + 8648 >> 2] = f;
							c[l >> 2] = 0;
							Ua(j, 10016, l);
							c[m + 56 >> 2] = 0;
							c[m + 60 >> 2] = (a | 0) / 400 | 0;
							c[m + 84 >> 2] = 0;
							f = 0;
							break
						}
					} else f = -3
				}
			while (0);
			if (e) c[e >> 2] = f;
			if (!f) {
				i = p;
				return n | 0
			}
			lc(m);
			n = 0;
			i = p;
			return n | 0
		}
		if (!e) {
			n = 0;
			i = p;
			return n | 0
		}
		c[e >> 2] = -1;
		n = 0;
		i = p;
		return n | 0
	}

	function Ub(e, f, h, j, l, m, n) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0.0,
			t = 0.0,
			u = 0,
			v = 0,
			w = 0.0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0;
		R = i;
		i = i + 112 | 0;
		F = R;
		Q = R + 8 | 0;
		if ((m | 0) < 0 | (m | 0) > 1) {
			K = -1;
			i = R;
			return K | 0
		}
		E = (m | 0) == 0;
		if (E ^ 1 | (h | 0) == 0 | (f | 0) == 0) {
			if ((l | 0) % ((c[e + 12 >> 2] | 0) / 400 | 0 | 0) | 0) {
				K = -1;
				i = R;
				return K | 0
			}
			if ((h | 0) == 0 | (f | 0) == 0) {
				o = e + 8 | 0;
				r = 0;
				do {
					p = Yb(e, 0, 0, j + ((_(r, c[o >> 2] | 0) | 0) << 2) | 0, l - r | 0, 0) | 0;
					if ((p | 0) < 0) {
						P = p;
						H = 109;
						break
					}
					r = r + p | 0
				} while ((r | 0) < (l | 0));
				if ((H | 0) == 109) {
					i = R;
					return P | 0
				}
				c[e + 68 >> 2] = r;
				K = r;
				i = R;
				return K | 0
			}
		}
		if ((h | 0) < 0) {
			K = -1;
			i = R;
			return K | 0
		}
		r = a[f >> 0] | 0;
		do
			if (r << 24 >> 24 >= 0) {
				m = (r & 96) == 96 ? 1001 : 1e3;
				if ((r & 96) == 96) {
					K = m;
					L = (r & 16) >>> 4 | 1104;
					break
				} else {
					K = m;
					L = ((r & 255) >>> 5 & 3) + 1101 | 0;
					break
				}
			} else {
				L = (r & 255) >>> 5 & 3;
				K = 1002;
				L = (L | 0) == 0 ? 1101 : L + 1102 | 0
			}
		while (0);
		I = Rb(f, c[e + 12 >> 2] | 0) | 0;
		J = ((r & 4) >>> 2) + 1 | 0;
		x = Rb(f, 48e3) | 0;
		m = f + 1 | 0;
		v = m;
		o = h + -1 | 0;
		a: do switch (r & 3 | 0) {
				case 0:
					{
						u = v;G = 1;p = o;
						break
					}
				case 1:
					if (!(o & 1)) {
						p = (o | 0) / 2 | 0;
						b[Q >> 1] = p;
						u = v;
						G = 2;
						break a
					} else {
						K = -4;
						i = R;
						return K | 0
					}
				case 2:
					{
						if ((h | 0) < 2) {
							b[Q >> 1] = -1;
							K = -4;
							i = R;
							return K | 0
						}
						u = a[m >> 0] | 0;do
							if ((u & 255) < 252) {
								u = u & 255;
								b[Q >> 1] = u;
								m = 1
							} else {
								if ((h | 0) >= 3) {
									u = (d[f + 2 >> 0] << 2) + (u & 255) & 65535;
									b[Q >> 1] = u;
									m = 2;
									break
								}
								b[Q >> 1] = -1;
								K = -4;
								i = R;
								return K | 0
							}
						while (0);
						p = o - m | 0;r = u << 16 >> 16;
						if ((p | 0) < (r | 0)) {
							K = -4;
							i = R;
							return K | 0
						} else {
							u = f + (m + 1) | 0;
							G = 2;
							p = p - r | 0;
							break a
						}
					}
				default:
					{
						if ((h | 0) < 2) {
							K = -4;
							i = R;
							return K | 0
						}
						r = f + 2 | 0;z = a[m >> 0] | 0;C = z & 63;
						if ((C | 0) == 0 | (_(x, C) | 0) > 5760) {
							K = -4;
							i = R;
							return K | 0
						}
						m = h + -2 | 0;
						if (z & 64) {
							while (1) {
								if ((m | 0) < 1) {
									P = -4;
									H = 109;
									break
								}
								y = r;
								B = y + 1 | 0;
								y = a[y >> 0] | 0;
								A = m + -1 | 0;
								if (y << 24 >> 24 != -1) break;
								m = A - 254 | 0;
								r = B
							}
							if ((H | 0) == 109) {
								i = R;
								return P | 0
							}
							m = A - (y & 255) | 0;
							if ((m | 0) < 0) {
								K = -4;
								i = R;
								return K | 0
							} else v = B
						} else v = r;
						if (z << 24 >> 24 >= 0) {
							p = (m | 0) / (C | 0) | 0;
							if ((_(p, C) | 0) != (m | 0)) {
								K = -4;
								i = R;
								return K | 0
							}
							u = C + -1 | 0;
							m = p & 65535;
							r = 0;
							while (1) {
								if ((r | 0) >= (u | 0)) {
									u = v;
									G = C;
									break a
								}
								b[Q + (r << 1) >> 1] = m;
								r = r + 1 | 0
							}
						}
						z = C + -1 | 0;x = m;h = v;y = m;o = 0;
						while (1) {
							if ((o | 0) >= (z | 0)) {
								H = 46;
								break
							}
							D = Q + (o << 1) | 0;
							if ((x | 0) < 1) {
								H = 38;
								break
							}
							m = h;
							r = a[m >> 0] | 0;
							if ((r & 255) < 252) {
								m = r & 255;
								b[D >> 1] = m;
								v = 1
							} else {
								if ((x | 0) < 2) {
									H = 42;
									break
								}
								m = (d[m + 1 >> 0] << 2) + (r & 255) & 65535;
								b[D >> 1] = m;
								v = 2
							}
							r = x - v | 0;
							m = m << 16 >> 16;
							if ((m | 0) > (r | 0)) {
								P = -4;
								H = 109;
								break
							}
							x = r;
							h = h + v | 0;
							y = y - (v + m) | 0;
							o = o + 1 | 0
						}
						if ((H | 0) == 38) {
							b[D >> 1] = -1;
							K = -4;
							i = R;
							return K | 0
						} else if ((H | 0) == 42) {
							b[D >> 1] = -1;
							K = -4;
							i = R;
							return K | 0
						} else if ((H | 0) == 46) {
							if ((y | 0) < 0) P = -4;
							else {
								u = h;
								G = C;
								p = y;
								break a
							}
							i = R;
							return P | 0
						} else if ((H | 0) == 109) {
							i = R;
							return P | 0
						}
					}
			}
			while (0);
			if ((p | 0) > 1275) {
				K = -4;
				i = R;
				return K | 0
			}
		b[Q + (G + -1 << 1) >> 1] = p;
		c[F >> 2] = u - f;
		m = 0;
		while (1) {
			if ((m | 0) >= (G | 0)) break;
			u = u + (b[Q + (m << 1) >> 1] | 0) | 0;
			m = m + 1 | 0
		}
		p = f + (c[F >> 2] | 0) | 0;
		if (!E) {
			if (!((I | 0) > (l | 0) | (K | 0) == 1002) ? (O = e + 52 | 0, (c[O >> 2] | 0) != 1002) : 0) {
				u = e + 68 | 0;
				m = c[u >> 2] | 0;
				r = l - I | 0;
				if ((I | 0) != (l | 0) ? (M = Ub(e, 0, 0, j, r, 0, n) | 0, (M | 0) < 0) : 0) {
					c[u >> 2] = m;
					K = M;
					i = R;
					return K | 0
				}
				c[O >> 2] = K;
				c[e + 48 >> 2] = L;
				c[e + 60 >> 2] = I;
				c[e + 44 >> 2] = J;
				o = Yb(e, p, b[Q >> 1] | 0, j + ((_(c[e + 8 >> 2] | 0, r) | 0) << 2) | 0, I, 1) | 0;
				if ((o | 0) < 0) {
					K = o;
					i = R;
					return K | 0
				}
				c[u >> 2] = l;
				K = l;
				i = R;
				return K | 0
			}
			K = Ub(e, 0, 0, j, l, 0, n) | 0;
			i = R;
			return K | 0
		}
		if ((_(G, I) | 0) > (l | 0)) {
			K = -2;
			i = R;
			return K | 0
		}
		c[e + 52 >> 2] = K;
		c[e + 48 >> 2] = L;
		c[e + 60 >> 2] = I;
		c[e + 44 >> 2] = J;
		u = e + 8 | 0;
		r = p;
		D = 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (G | 0)) break;
			p = Q + (m << 1) | 0;
			o = Yb(e, r, b[p >> 1] | 0, j + ((_(D, c[u >> 2] | 0) | 0) << 2) | 0, l - D | 0, 0) | 0;
			if ((o | 0) < 0) {
				P = o;
				H = 109;
				break
			}
			r = r + (b[p >> 1] | 0) | 0;
			D = D + o | 0;
			m = m + 1 | 0
		}
		if ((H | 0) == 109) {
			i = R;
			return P | 0
		}
		c[e + 68 >> 2] = D;
		if (!n) {
			g[e + 76 >> 2] = 0.0;
			g[e + 72 >> 2] = 0.0;
			K = D;
			i = R;
			return K | 0
		}
		B = c[u >> 2] | 0;
		if ((B | 0) < 1 | (D | 0) < 1 | (j | 0) == 0) {
			K = D;
			i = R;
			return K | 0
		}
		r = _(D, B) | 0;
		o = 0;
		while (1) {
			if ((o | 0) >= (r | 0)) {
				h = 0;
				break
			}
			p = j + (o << 2) | 0;
			q = +g[p >> 2];
			if (!(q > 2.0)) {
				if (q < -2.0) q = -2.0
			} else q = 2.0;
			g[p >> 2] = q;
			o = o + 1 | 0
		}
		while (1) {
			if ((h | 0) == (B | 0)) {
				P = D;
				break
			}
			z = j + (h << 2) | 0;
			x = e + 72 + (h << 2) | 0;
			q = +g[x >> 2];
			p = 0;
			while (1) {
				if ((p | 0) >= (D | 0)) break;
				r = j + (h + (_(p, B) | 0) << 2) | 0;
				s = +g[r >> 2];
				t = s * q;
				if (t >= 0.0) break;
				g[r >> 2] = s + t * s;
				p = p + 1 | 0
			}
			w = +g[z >> 2];
			p = 0;
			while (1) {
				m = p;
				while (1) {
					if ((m | 0) >= (D | 0)) break;
					q = +g[j + (h + (_(m, B) | 0) << 2) >> 2];
					if (q > 1.0 | q < -1.0) break;
					m = m + 1 | 0
				}
				if ((m | 0) == (D | 0)) {
					o = 0;
					break
				}
				q = +g[j + (h + (_(m, B) | 0) << 2) >> 2];
				t = +N(+q);
				u = m;
				while (1) {
					if ((u | 0) <= 0) {
						v = m;
						s = t;
						r = m;
						break
					}
					r = u + -1 | 0;
					if (!(q * +g[j + (h + (_(r, B) | 0) << 2) >> 2] >= 0.0)) {
						v = m;
						s = t;
						r = m;
						break
					} else u = r
				}
				while (1) {
					if ((v | 0) >= (D | 0)) break;
					t = +g[j + (h + (_(v, B) | 0) << 2) >> 2];
					if (!(q * t >= 0.0)) break;
					t = +N(+t);
					H = t > s;
					K = H ? v : r;
					v = v + 1 | 0;
					s = H ? t : s;
					r = K
				}
				if (!u) m = q * +g[z >> 2] >= 0.0;
				else m = 0;
				t = (s + -1.0) / (s * s);
				t = q > 0.0 ? -t : t;
				o = (g[k >> 2] = t, c[k >> 2] | 0);
				while (1) {
					if ((u | 0) >= (v | 0)) break;
					K = j + (h + (_(u, B) | 0) << 2) | 0;
					q = +g[K >> 2];
					g[K >> 2] = q + t * q * q;
					u = u + 1 | 0
				}
				b: do
					if (m & (r | 0) > 1) {
						t = w - +g[z >> 2];
						q = t / +(r | 0);
						m = p;
						while (1) {
							if ((m | 0) >= (r | 0)) break b;
							t = t - q;
							u = j + (h + (_(m, B) | 0) << 2) | 0;
							s = +g[u >> 2] + t;
							g[u >> 2] = s;
							do
								if (s > 1.0) s = 1.0;
								else if (s < -1.0) {
								s = -1.0;
								break
							} while (0);
							g[u >> 2] = s;
							m = m + 1 | 0
						}
					}
				while (0);
				if ((v | 0) == (D | 0)) break;
				else p = v
			}
			c[x >> 2] = o;
			h = h + 1 | 0
		}
		i = R;
		return P | 0
	}

	function Vb(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		if ((e | 0) < 1) {
			b = -1;
			return b | 0
		}
		b = Ub(a, b, c, d, e, f, 0) | 0;
		return b | 0
	}

	function Wb(d, e, f) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		m = i;
		i = i + 32 | 0;
		h = m + 8 | 0;
		j = m;
		g = m + 16 | 0;
		k = c[d + 4 >> 2] | 0;
		l = d + (c[d >> 2] | 0) | 0;
		c[g >> 2] = f;
		a: do switch (e | 0) {
				case 4009:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if (!e) e = 23;
						else {
							c[e >> 2] = c[d + 48 >> 2];
							f = 0;
							e = 22
						}
						break
					}
				case 4031:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if (!e) e = 23;
						else {
							c[e >> 2] = c[d + 80 >> 2];
							f = 0;
							e = 22
						}
						break
					}
				case 4028:
					{
						g = d + k | 0;h = d + 44 | 0;e = h;f = e + 44 | 0;do {
							a[e >> 0] = 0;
							e = e + 1 | 0
						} while ((e | 0) < (f | 0));Ua(l, 4028, j);e = 0;
						while (1) {
							if ((e | 0) == 2) break;
							vb(g + (e * 4260 | 0) | 0);
							e = e + 1 | 0
						}
						f = d + (k + 8520) | 0;b[f >> 1] = 0;b[f + 2 >> 1] = 0;b[f + 4 >> 1] = 0;b[f + 6 >> 1] = 0;b[f + 8 >> 1] = 0;b[f + 10 >> 1] = 0;c[d + (k + 8540) >> 2] = 0;c[h >> 2] = c[d + 8 >> 2];c[d + 60 >> 2] = (c[d + 12 >> 2] | 0) / 400 | 0;f = 0;e = 22;
						break
					}
				case 4029:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if (!e) e = 23;
						else {
							c[e >> 2] = c[d + 12 >> 2];
							f = 0;
							e = 22
						}
						break
					}
				case 4033:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if (e)
							if ((c[d + 56 >> 2] | 0) == 1002) {
								c[h >> 2] = e;
								Ua(l, 4033, h);
								f = 0;
								e = 22;
								break a
							} else {
								c[e >> 2] = c[d + 36 >> 2];
								f = 0;
								e = 22;
								break a
							}
						else e = 23;
						break
					}
				case 4045:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if (!e) e = 23;
						else {
							c[e >> 2] = c[d + 40 >> 2];
							f = 0;
							e = 22
						}
						break
					}
				case 4034:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if ((e | 0) < -32768 | (e | 0) > 32767) e = 23;
						else {
							c[d + 40 >> 2] = e;
							f = 0;
							e = 22
						}
						break
					}
				case 4039:
					{
						f = (c[g >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[f >> 2] | 0;c[g >> 2] = f + 4;
						if (!e) e = 23;
						else {
							c[e >> 2] = c[d + 68 >> 2];
							f = 0;
							e = 22
						}
						break
					}
				default:
					{
						f = -5;e = 22
					}
			}
			while (0);
			if ((e | 0) == 22) {
				i = m;
				return f | 0
			} else
		if ((e | 0) == 23) {
			f = -1;
			i = m;
			return f | 0
		}
		return 0
	}

	function Xb(a) {
		a = a | 0;
		lc(a);
		return
	}

	function Yb(a, e, f, h, j, k) {
		a = a | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		k = k | 0;
		var l = 0,
			m = 0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			Y = 0,
			Z = 0,
			$ = 0,
			ba = 0,
			ca = 0,
			da = 0,
			ea = 0,
			fa = 0,
			ga = 0,
			ha = 0;
		ha = i;
		i = i + 160 | 0;
		ba = ha + 80 | 0;
		$ = ha + 72 | 0;
		Z = ha + 64 | 0;
		V = ha + 56 | 0;
		S = ha + 48 | 0;
		Q = ha + 40 | 0;
		O = ha + 32 | 0;
		M = ha + 24 | 0;
		L = ha + 16 | 0;
		K = ha + 8 | 0;
		J = ha;
		fa = ha + 96 | 0;
		B = ha + 92 | 0;
		ga = ha + 88 | 0;
		R = ha + 144 | 0;
		U = ha + 84 | 0;
		c[ga >> 2] = 0;
		y = c[a + 4 >> 2] | 0;
		A = a + y | 0;
		Y = a + (c[a >> 2] | 0) | 0;
		o = c[a + 12 >> 2] | 0;
		T = (o | 0) / 50 | 0;
		z = T >> 1;
		ca = T >> 2;
		da = T >> 3;
		if ((da | 0) > (j | 0)) {
			ca = -2;
			i = ha;
			return ca | 0
		}
		ea = a + 12 | 0;
		o = ((o | 0) / 25 | 0) * 3 | 0;
		o = (o | 0) > (j | 0) ? j : o;
		do
			if ((f | 0) >= 2) {
				j = (e | 0) == 0;
				if (!j) {
					q = c[a + 60 >> 2] | 0;
					s = c[a + 52 >> 2] | 0;
					Ya(fa, e, f);
					m = c[a + 56 >> 2] | 0;
					if ((m | 0) > 0) {
						m = (m | 0) == 1002;
						if ((s | 0) != 1002) {
							if (!m) {
								p = o;
								o = q;
								m = s;
								D = 22;
								break
							}
							E = _(ca, c[a + 8 >> 2] | 0) | 0;
							N = e;
							p = o;
							H = 0;
							W = na() | 0;
							P = s;
							t = 0;
							o = 1;
							break
						}
						if (!m ? (c[a + 64 >> 2] | 0) == 0 : 0) {
							N = _(ca, c[a + 8 >> 2] | 0) | 0;
							W = na() | 0;
							t = i;
							i = i + ((1 * (N << 2) | 0) + 15 & -16) | 0;
							Yb(a, 0, 0, t, (ca | 0) < (q | 0) ? ca : q, 0) | 0;
							N = e;
							p = o;
							H = 0;
							P = s;
							E = 1;
							o = 1
						} else {
							p = o;
							o = q;
							m = s;
							D = 22
						}
					} else {
						p = o;
						o = q;
						m = s;
						D = 22
					}
				} else D = 5
			} else {
				j = c[a + 60 >> 2] | 0;
				e = 0;
				o = (o | 0) < (j | 0) ? o : j;
				j = 1;
				D = 5
			}
		while (0);
		do
			if ((D | 0) == 5) {
				m = c[a + 56 >> 2] | 0;
				if (!m) {
					l = a + 8 | 0;
					m = 0;
					while (1) {
						if ((m | 0) >= (_(o, c[l >> 2] | 0) | 0)) {
							l = o;
							break
						}
						g[h + (m << 2) >> 2] = 0.0;
						m = m + 1 | 0
					}
					i = ha;
					return l | 0
				}
				if ((o | 0) <= (T | 0)) {
					if ((o | 0) >= (T | 0)) {
						p = o;
						D = 22;
						break
					}
					if ((o | 0) > (z | 0)) {
						p = o;
						o = z;
						D = 22;
						break
					}
					if ((m | 0) == 1e3) {
						p = o;
						m = 1e3;
						D = 22;
						break
					}
					p = o;
					o = (o | 0) > (ca | 0) & (o | 0) < (z | 0) ? ca : o;
					D = 22;
					break
				}
				j = a + 8 | 0;
				m = h;
				e = o;
				while (1) {
					l = Yb(a, 0, 0, m, (e | 0) < (T | 0) ? e : T, 0) | 0;
					if ((l | 0) < 0) {
						D = 128;
						break
					}
					m = m + ((_(l, c[j >> 2] | 0) | 0) << 2) | 0;
					e = e - l | 0;
					if ((e | 0) <= 0) {
						l = o;
						D = 128;
						break
					}
				}
				if ((D | 0) == 128) {
					i = ha;
					return l | 0
				}
			}
		while (0);
		if ((D | 0) == 22) {
			N = e;
			H = 1;
			W = na() | 0;
			q = o;
			P = m;
			t = 0;
			E = 1;
			o = 0
		}
		a: do
			if ((q | 0) > (p | 0)) l = -1;
			else {
				I = (P | 0) == 1002;
				if (I) {
					x = i;
					i = i + 16 | 0
				} else {
					s = (_((z | 0) > (q | 0) ? z : q, c[a + 8 >> 2] | 0) | 0) << 1;
					x = i;
					i = i + ((1 * s | 0) + 15 & -16) | 0;
					if ((c[a + 56 >> 2] | 0) == 1002) {
						p = 0;
						while (1) {
							if ((p | 0) == 2) break;
							vb(A + (p * 4260 | 0) | 0);
							p = p + 1 | 0
						}
						s = a + (y + 8520) | 0;
						b[s >> 1] = 0;
						b[s + 2 >> 1] = 0;
						b[s + 4 >> 1] = 0;
						b[s + 6 >> 1] = 0;
						b[s + 8 >> 1] = 0;
						b[s + 10 >> 1] = 0;
						c[a + (y + 8540) >> 2] = 0
					}
					s = (q * 1e3 | 0) / (c[ea >> 2] | 0) | 0;
					c[a + 32 >> 2] = (s | 0) < 10 ? 10 : s;
					if (j) l = 1;
					else {
						c[a + 20 >> 2] = c[a + 44 >> 2];
						b: do
							if ((P | 0) == 1e3) switch (c[a + 48 >> 2] | 0) {
								case 1101:
									{
										c[a + 28 >> 2] = 8e3;
										break b
									}
								case 1102:
									{
										c[a + 28 >> 2] = 12e3;
										break b
									}
								case 1103:
									{
										c[a + 28 >> 2] = 16e3;
										break b
									}
								default:
									{
										c[a + 28 >> 2] = 16e3;
										break b
									}
							} else c[a + 28 >> 2] = 16e3;
						while (0);
						l = k << 1
					}
					p = a + 16 | 0;
					e = a + 84 | 0;
					m = a + 8 | 0;
					u = (l | 0) == 0;
					v = 0;
					w = x;
					do {
						c: do
							if (!(Ab(A, p, l, (v | 0) == 0 & 1, fa, w, B, c[e >> 2] | 0) | 0)) s = c[m >> 2] | 0;
							else {
								if (u) {
									l = -3;
									break a
								}
								c[B >> 2] = q;
								r = 0;
								while (1) {
									s = c[m >> 2] | 0;
									if ((r | 0) >= (_(q, s) | 0)) break c;
									b[w + (r << 1) >> 1] = 0;
									r = r + 1 | 0
								}
							}while (0);r = c[B >> 2] | 0;w = w + ((_(r, s) | 0) << 1) | 0;v = v + r | 0
					} while ((v | 0) < (q | 0))
				}
				k = (k | 0) == 0;
				do
					if (k)
						if (!I)
							if (!j ? (G = fa + 20 | 0, F = fa + 28 | 0, C = c[F >> 2] | 0, s = (c[G >> 2] | 0) + ((aa(C | 0) | 0) + -32) + 17 | 0, (s + ((c[a + 52 >> 2] | 0) == 1001 ? 20 : 0) | 0) <= (f << 3 | 0)) : 0) {
								A = (P | 0) == 1001;
								j = fa + 32 | 0;
								if (A) {
									e = c[j >> 2] | 0;
									m = C >>> 12;
									y = e >>> 0 < m >>> 0;
									z = y & 1;
									if (!y) {
										c[fa + 32 >> 2] = e - m;
										m = C - m | 0
									}
									w = fa + 28 | 0;
									c[w >> 2] = m;
									v = fa + 20 | 0;
									u = fa + 40 | 0;
									l = fa + 24 | 0;
									e = fa + 4 | 0;
									p = fa + 32 | 0;
									while (1) {
										if (m >>> 0 >= 8388609) break;
										c[v >> 2] = (c[v >> 2] | 0) + 8;
										m = m << 8;
										c[w >> 2] = m;
										r = c[u >> 2] | 0;
										s = c[l >> 2] | 0;
										if (s >>> 0 < (c[e >> 2] | 0) >>> 0) {
											c[l >> 2] = s + 1;
											s = d[(c[fa >> 2] | 0) + s >> 0] | 0
										} else s = 0;
										c[u >> 2] = s;
										c[p >> 2] = ((r << 8 | s) >>> 1 & 255 | c[p >> 2] << 8 & 2147483392) ^ 255
									}
									if (!y) {
										j = f;
										e = 0;
										m = 0;
										l = 0;
										D = 75;
										break
									}
									p = c[F >> 2] | 0
								} else {
									p = C;
									z = 1
								}
								j = c[j >> 2] | 0;
								e = p >>> 1;
								s = j >>> 0 < e >>> 0;
								y = s & 1;
								if (!s) {
									c[fa + 32 >> 2] = j - e;
									e = p - e | 0
								}
								u = fa + 28 | 0;
								c[u >> 2] = e;
								l = fa + 20 | 0;
								m = fa + 40 | 0;
								j = fa + 24 | 0;
								p = fa + 4 | 0;
								v = fa + 32 | 0;
								while (1) {
									if (e >>> 0 >= 8388609) break;
									c[l >> 2] = (c[l >> 2] | 0) + 8;
									e = e << 8;
									c[u >> 2] = e;
									s = c[m >> 2] | 0;
									r = c[j >> 2] | 0;
									if (r >>> 0 < (c[p >> 2] | 0) >>> 0) {
										c[j >> 2] = r + 1;
										r = d[(c[fa >> 2] | 0) + r >> 0] | 0
									} else r = 0;
									c[m >> 2] = r;
									c[v >> 2] = ((s << 8 | r) >>> 1 & 255 | c[v >> 2] << 8 & 2147483392) ^ 255
								}
								if (A) {
									m = (_a(fa, 256) | 0) + 2 | 0;
									e = c[F >> 2] | 0;
									j = c[G >> 2] | 0
								} else {
									j = c[G >> 2] | 0;
									e = c[F >> 2] | 0;
									m = f - (j + ((aa(e | 0) | 0) + -32) + 7 >> 3) | 0
								}
								f = f - m | 0;
								D = (f << 3 | 0) < (j + ((aa(e | 0) | 0) + -32) | 0);
								l = D ? 0 : m;
								j = fa + 4 | 0;
								c[j >> 2] = (c[j >> 2] | 0) - l;
								j = D ? 0 : f;
								e = y;
								m = D ? 0 : z;
								D = 75
							} else {
								j = f;
								e = 0;
								m = 0;
								l = 0;
								D = 76
							}
				else {
					y = f;
					A = 0;
					m = 0;
					l = 0;
					p = 0
				} else {
					j = f;
					e = 0;
					m = 0;
					l = 0;
					D = 75
				}
				while (0);
				if ((D | 0) == 75)
					if (I) {
						y = j;
						A = e;
						p = 0
					} else D = 76;
				if ((D | 0) == 76) {
					y = j;
					A = e;
					p = 17
				}
				switch (c[a + 48 >> 2] | 0) {
					case 1101:
						{
							j = 13;
							break
						}
					case 1103:
					case 1102:
						{
							j = 17;
							break
						}
					case 1104:
						{
							j = 19;
							break
						}
					default:
						j = 21
				}
				c[J >> 2] = j;
				Ua(Y, 10012, J);
				c[K >> 2] = c[a + 44 >> 2];
				Ua(Y, 10008, K);
				z = (m | 0) == 0;
				if (!z) {
					K = (_(ca, c[a + 8 >> 2] | 0) | 0) << 2;
					o = i;
					i = i + ((1 * K | 0) + 15 & -16) | 0;
					if (!A) {
						s = o;
						r = 0
					} else {
						c[L >> 2] = 0;
						Ua(Y, 10010, L);
						Ta(Y, N + y | 0, l, o, ca, 0, 0) | 0;
						c[M >> 2] = ga;
						Ua(Y, 4031, M);
						s = o;
						r = 0
					}
				} else {
					j = i;
					i = i + ((1 * (E << 2) | 0) + 15 & -16) | 0;
					do
						if (!(H | I))
							if ((ca | 0) < (q | 0)) {
								Yb(a, 0, 0, j, ca, 0) | 0;
								break
							} else {
								Yb(a, 0, 0, j, q, 0) | 0;
								break
							}
					else {
						j = t;
						o = H ? 0 : o
					} while (0);
					s = i;
					i = i + 16 | 0;
					t = j;
					r = o
				}
				c[O >> 2] = p;
				Ua(Y, 10010, O);
				do
					if ((P | 0) == 1e3) {
						b[R >> 1] = -1;
						j = a + 8 | 0;
						e = 0;
						while (1) {
							if ((e | 0) >= (_(q, c[j >> 2] | 0) | 0)) break;
							g[h + (e << 2) >> 2] = 0.0;
							e = e + 1 | 0
						}
						if ((c[a + 56 >> 2] | 0) == 1001) {
							if (!(z | (A | 0) == 0) ? (c[a + 64 >> 2] | 0) != 0 : 0) {
								p = 0;
								break
							}
							c[S >> 2] = 0;
							Ua(Y, 10010, S);
							Ta(Y, R, 2, h, da, 0, 0) | 0;
							p = 0
						} else p = 0
					} else {
						j = (T | 0) < (q | 0) ? T : q;
						T = c[a + 56 >> 2] | 0;
						if ((P | 0) != (T | 0) & (T | 0) > 0 ? (c[a + 64 >> 2] | 0) == 0 : 0) Ua(Y, 4028, Q);
						p = Ta(Y, k ? N : 0, y, h, j, fa, 0) | 0
					}
				while (0);
				d: do
					if (!I) {
						j = a + 8 | 0;
						e = 0;
						while (1) {
							if ((e | 0) >= (_(q, c[j >> 2] | 0) | 0)) break d;
							T = h + (e << 2) | 0;
							g[T >> 2] = +g[T >> 2] + +(b[x + (e << 1) >> 1] | 0) * .000030517578125;
							e = e + 1 | 0
						}
					}
				while (0);
				c[V >> 2] = U;
				Ua(Y, 10015, V);
				o = c[(c[U >> 2] | 0) + 60 >> 2] | 0;
				do
					if (!z) {
						if (!A) {
							Ua(Y, 4028, Z);
							c[$ >> 2] = 0;
							Ua(Y, 10010, $);
							Ta(Y, N + y | 0, l, s, ca, 0, 0) | 0;
							c[ba >> 2] = ga;
							Ua(Y, 4031, ba);
							ba = c[a + 8 >> 2] | 0;
							$ = h + ((_(ba, q - da | 0) | 0) << 2) | 0;
							Z = s + ((_(ba, da) | 0) << 2) | 0;
							Zb($, Z, $, da, ba, o, c[ea >> 2] | 0);
							break
						}
						e = a + 8 | 0;
						m = 0;
						while (1) {
							j = c[e >> 2] | 0;
							if ((m | 0) < (j | 0)) j = 0;
							else break;
							while (1) {
								if ((j | 0) >= (da | 0)) break;
								ba = (_(c[e >> 2] | 0, j) | 0) + m | 0;
								c[h + (ba << 2) >> 2] = c[s + (ba << 2) >> 2];
								j = j + 1 | 0
							}
							m = m + 1 | 0
						}
						$ = _(j, da) | 0;
						ba = h + ($ << 2) | 0;
						Zb(s + ($ << 2) | 0, ba, ba, da, j, o, c[ea >> 2] | 0)
					}
				while (0);
				do
					if (r) {
						l = a + 8 | 0;
						if ((q | 0) < (ca | 0)) {
							Zb(t, h, h, da, c[l >> 2] | 0, o, c[ea >> 2] | 0);
							break
						} else m = 0;
						while (1) {
							j = c[l >> 2] | 0;
							e = _(j, da) | 0;
							if ((m | 0) >= (e | 0)) break;
							c[h + (m << 2) >> 2] = c[t + (m << 2) >> 2];
							m = m + 1 | 0
						}
						ca = h + (e << 2) | 0;
						Zb(t + (e << 2) | 0, ca, ca, da, j, o, c[ea >> 2] | 0)
					}
				while (0);
				j = c[a + 40 >> 2] | 0;
				e: do
					if (j) {
						n = +X(+(+(j | 0) * 6.488140788860619e-04 * .6931471805599453));
						j = a + 8 | 0;
						e = 0;
						while (1) {
							if ((e | 0) >= (_(q, c[j >> 2] | 0) | 0)) break e;
							ca = h + (e << 2) | 0;
							g[ca >> 2] = +g[ca >> 2] * n;
							e = e + 1 | 0
						}
					}
				while (0);
				if ((y | 0) < 2) e = 0;
				else e = c[fa + 28 >> 2] ^ c[ga >> 2];
				c[a + 80 >> 2] = e;
				c[a + 56 >> 2] = P;
				c[a + 64 >> 2] = (z ? 0 : (A | 0) == 0) & 1;
				l = (p | 0) < 0 ? p : q
			}
		while (0);
		va(W | 0);
		ca = l;
		i = ha;
		return ca | 0
	}

	function Zb(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0.0;
		h = 48e3 / (h | 0) | 0;
		i = 0;
		while (1) {
			if ((i | 0) < (e | 0)) j = 0;
			else break;
			while (1) {
				if ((j | 0) >= (d | 0)) break;
				l = +g[f + ((_(j, h) | 0) << 2) >> 2];
				l = l * l;
				k = (_(j, e) | 0) + i | 0;
				g[c + (k << 2) >> 2] = l * +g[b + (k << 2) >> 2] + (1.0 - l) * +g[a + (k << 2) >> 2];
				j = j + 1 | 0
			}
			i = i + 1 | 0
		}
		return
	}

	function _b(b, d, e, f, h) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		if ((f | 0) > 10 | (f | 0) < 0) {
			if (!h) {
				f = 0;
				return f | 0
			}
			c[h >> 2] = 3;
			f = 0;
			return f | 0
		}
		w = kc(96) | 0;
		if ((w | 0) != 0 ? (c[w + -4 >> 2] & 3 | 0) != 0 : 0) {
			j = w;
			i = j + 96 | 0;
			do {
				a[j >> 0] = 0;
				j = j + 1 | 0
			} while ((j | 0) < (i | 0))
		}
		i = w;
		c[w + 52 >> 2] = 0;
		c[w + 56 >> 2] = 0;
		o = w + 4 | 0;
		q = w + 8 | 0;
		s = w + 12 | 0;
		n = w + 16 | 0;
		c[w >> 2] = 0;
		c[w + 4 >> 2] = 0;
		c[w + 8 >> 2] = 0;
		c[w + 12 >> 2] = 0;
		c[n >> 2] = -1;
		c[w + 80 >> 2] = 0;
		c[w + 28 >> 2] = 0;
		c[w + 24 >> 2] = 0;
		v = w + 72 | 0;
		c[v >> 2] = 0;
		c[w + 84 >> 2] = 0;
		g[w + 44 >> 2] = 1.0;
		t = w + 20 | 0;
		c[t >> 2] = b;
		c[w + 88 >> 2] = 1;
		c[w + 92 >> 2] = 1;
		c[w + 32 >> 2] = 160;
		l = b << 2;
		m = (l | 0) == 0;
		k = m ? 0 : l;
		j = kc(k) | 0;
		if ((j | 0) != 0 ? (c[j + -4 >> 2] & 3 | 0) != 0 : 0) qc(j | 0, 0, k | 0) | 0;
		u = w + 60 | 0;
		c[u >> 2] = j;
		k = m ? 0 : l;
		j = kc(k) | 0;
		if ((j | 0) != 0 ? (c[j + -4 >> 2] & 3 | 0) != 0 : 0) qc(j | 0, 0, k | 0) | 0;
		r = w + 68 | 0;
		c[r >> 2] = j;
		k = m ? 0 : l;
		j = kc(k) | 0;
		if ((j | 0) != 0 ? (c[j + -4 >> 2] & 3 | 0) != 0 : 0) qc(j | 0, 0, k | 0) | 0;
		l = w + 64 | 0;
		c[l >> 2] = j;
		k = 0;
		while (1) {
			if ((k | 0) == (b | 0)) break;
			c[(c[u >> 2] | 0) + (k << 2) >> 2] = 0;
			c[(c[r >> 2] | 0) + (k << 2) >> 2] = 0;
			c[(c[l >> 2] | 0) + (k << 2) >> 2] = 0;
			k = k + 1 | 0
		}
		if ((c[n >> 2] | 0) != (f | 0) ? (c[n >> 2] = f, (c[w + 52 >> 2] | 0) != 0) : 0) cc(w) | 0;
		if (((c[w >> 2] | 0) == (d | 0) ? (c[o >> 2] | 0) == (e | 0) : 0) ? (c[q >> 2] | 0) == (d | 0) : 0) {
			k = c[s >> 2] | 0;
			if ((k | 0) != (e | 0)) {
				m = k;
				p = 27
			}
		} else {
			m = c[s >> 2] | 0;
			p = 27
		}
		if ((p | 0) == 27) {
			c[w >> 2] = d;
			c[o >> 2] = e;
			c[q >> 2] = d;
			c[s >> 2] = e;
			k = d;
			j = 2;
			while (1) {
				if (j >>> 0 > (c[(k >>> 0 < e >>> 0 ? q : s) >> 2] | 0) >>> 0) break;
				k = c[q >> 2] | 0;
				while (1) {
					if ((k >>> 0) % (j >>> 0) | 0) break;
					e = c[s >> 2] | 0;
					if ((e >>> 0) % (j >>> 0) | 0) break;
					f = (k >>> 0) / (j >>> 0) | 0;
					c[q >> 2] = f;
					e = (e >>> 0) / (j >>> 0) | 0;
					c[s >> 2] = e;
					k = f
				}
				j = j + 1 | 0
			}
			a: do
				if (m) {
					e = 0;
					while (1) {
						if (e >>> 0 >= (c[t >> 2] | 0) >>> 0) break a;
						j = (c[l >> 2] | 0) + (e << 2) | 0;
						c[j >> 2] = ((_(c[j >> 2] | 0, c[s >> 2] | 0) | 0) >>> 0) / (m >>> 0) | 0;
						j = (c[l >> 2] | 0) + (e << 2) | 0;
						k = c[s >> 2] | 0;
						if ((c[j >> 2] | 0) >>> 0 >= k >>> 0) c[j >> 2] = k + -1;
						e = e + 1 | 0
					}
				}
			while (0);
			if (c[w + 52 >> 2] | 0) cc(w) | 0
		}
		j = cc(w) | 0;
		if (!j) c[w + 52 >> 2] = 1;
		else {
			lc(c[v >> 2] | 0);
			lc(c[w + 76 >> 2] | 0);
			lc(c[u >> 2] | 0);
			lc(c[r >> 2] | 0);
			lc(c[l >> 2] | 0);
			lc(w);
			i = 0
		}
		if (!h) {
			f = i;
			return f | 0
		}
		c[h >> 2] = j;
		f = i;
		return f | 0
	}

	function $b(a) {
		a = a | 0;
		lc(c[a + 72 >> 2] | 0);
		lc(c[a + 76 >> 2] | 0);
		lc(c[a + 60 >> 2] | 0);
		lc(c[a + 68 >> 2] | 0);
		lc(c[a + 64 >> 2] | 0);
		lc(a);
		return
	}

	function ac(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0;
		y = i;
		i = i + 16 | 0;
		q = y + 12 | 0;
		p = y + 8 | 0;
		w = y + 4 | 0;
		x = y;
		k = c[e >> 2] | 0;
		j = c[h >> 2] | 0;
		u = c[a + 72 >> 2] | 0;
		s = c[a + 28 >> 2] | 0;
		v = _(s, b) | 0;
		r = (c[a + 24 >> 2] | 0) + -1 | 0;
		s = s - r | 0;
		t = c[a + 88 >> 2] | 0;
		o = a + 68 | 0;
		l = (c[o >> 2] | 0) + (b << 2) | 0;
		if (c[l >> 2] | 0) {
			c[q >> 2] = j;
			c[p >> 2] = c[l >> 2];
			dc(a, b, p, f, q);
			l = (c[o >> 2] | 0) + (b << 2) | 0;
			c[l >> 2] = (c[l >> 2] | 0) - (c[p >> 2] | 0);
			l = c[o >> 2] | 0;
			m = c[l + (b << 2) >> 2] | 0;
			a: do
				if (m) {
					n = 0;
					while (1) {
						if (n >>> 0 >= m >>> 0) break a;
						l = r + n | 0;
						c[u + (v + l << 2) >> 2] = c[u + (v + (l + (c[p >> 2] | 0)) << 2) >> 2];
						l = c[o >> 2] | 0;
						m = c[l + (b << 2) >> 2] | 0;
						n = n + 1 | 0
					}
				}
			while (0);
			q = c[q >> 2] | 0;
			f = f + ((_(q, c[a + 92 >> 2] | 0) | 0) << 2) | 0;
			j = j - q | 0;
			if (c[l + (b << 2) >> 2] | 0) {
				q = k;
				d = j;
				p = c[e >> 2] | 0;
				q = p - q | 0;
				c[e >> 2] = q;
				q = c[h >> 2] | 0;
				d = q - d | 0;
				c[h >> 2] = d;
				i = y;
				return
			}
		}
		o = a + 92 | 0;
		p = d;
		b: while (1) {
			q = (p | 0) == 0;
			do {
				if (!((k | 0) != 0 & (j | 0) != 0)) break b;
				l = k >>> 0 > s >>> 0 ? s : k;
				c[w >> 2] = l;
				c[x >> 2] = j;
				c: do
					if (q) {
						m = 0;
						while (1) {
							if (m >>> 0 >= l >>> 0) break c;
							g[u + (v + (m + r) << 2) >> 2] = 0.0;
							l = c[w >> 2] | 0;
							m = m + 1 | 0
						}
					} else {
						m = 0;
						while (1) {
							if (m >>> 0 >= l >>> 0) break c;
							c[u + (v + (m + r) << 2) >> 2] = c[p + ((_(m, t) | 0) << 2) >> 2];
							l = c[w >> 2] | 0;
							m = m + 1 | 0
						}
					}
				while (0);
				dc(a, b, w, f, x);
				l = c[w >> 2] | 0;
				k = k - l | 0;
				d = c[x >> 2] | 0;
				j = j - d | 0;
				f = f + ((_(d, c[o >> 2] | 0) | 0) << 2) | 0
			} while (q);
			p = p + ((_(l, t) | 0) << 2) | 0
		}
		d = c[e >> 2] | 0;
		d = d - k | 0;
		c[e >> 2] = d;
		d = c[h >> 2] | 0;
		d = d - j | 0;
		c[h >> 2] = d;
		i = y;
		return
	}

	function bc(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		g = c[f >> 2] | 0;
		h = c[d >> 2] | 0;
		j = a + 88 | 0;
		k = c[j >> 2] | 0;
		l = a + 92 | 0;
		m = c[l >> 2] | 0;
		n = a + 20 | 0;
		i = c[n >> 2] | 0;
		c[l >> 2] = i;
		c[j >> 2] = i;
		o = (b | 0) == 0;
		p = 0;
		while (1) {
			if (p >>> 0 >= i >>> 0) break;
			c[f >> 2] = g;
			c[d >> 2] = h;
			if (o) ac(a, p, 0, d, e + (p << 2) | 0, f);
			else ac(a, p, b + (p << 2) | 0, d, e + (p << 2) | 0, f);
			i = c[n >> 2] | 0;
			p = p + 1 | 0
		}
		c[j >> 2] = k;
		c[l >> 2] = m;
		return (c[a + 84 >> 2] | 0) == 1 | 0
	}

	function cc(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0;
		q = a + 24 | 0;
		r = c[q >> 2] | 0;
		s = a + 28 | 0;
		p = c[s >> 2] | 0;
		h = c[a + 8 >> 2] | 0;
		b = a + 12 | 0;
		e = c[b >> 2] | 0;
		c[a + 36 >> 2] = (h >>> 0) / (e >>> 0) | 0;
		c[a + 40 >> 2] = (h >>> 0) % (e >>> 0) | 0;
		d = a + 16 | 0;
		j = c[d >> 2] | 0;
		k = c[18852 + (j * 20 | 0) + 4 >> 2] | 0;
		o = a + 48 | 0;
		c[o >> 2] = k;
		i = c[18852 + (j * 20 | 0) >> 2] | 0;
		c[q >> 2] = i;
		if (h >>> 0 > e >>> 0) {
			g[a + 44 >> 2] = +g[18852 + (j * 20 | 0) + 8 >> 2] * +(e >>> 0) / +(h >>> 0);
			i = (((_(i, h) | 0) >>> 0) / (e >>> 0) | 0) + 7 & -8;
			c[q >> 2] = i;
			if (e << 1 >>> 0 < h >>> 0) {
				k = k >>> 1;
				c[o >> 2] = k
			}
			if (e << 2 >>> 0 < h >>> 0) {
				k = k >>> 1;
				c[o >> 2] = k
			}
			if (e << 3 >>> 0 < h >>> 0) {
				k = k >>> 1;
				c[o >> 2] = k
			}
			if (e << 4 >>> 0 < h >>> 0) {
				k = k >>> 1;
				c[o >> 2] = k
			}
			if (!k) {
				c[o >> 2] = 1;
				k = 1
			}
		} else c[a + 44 >> 2] = c[18852 + (j * 20 | 0) + 12 >> 2];
		j = _(i, e) | 0;
		f = (_(i, k) | 0) + 8 | 0;
		if (j >>> 0 <= f >>> 0) {
			n = (536870911 / (e >>> 0) | 0) >>> 0 >= i >>> 0;
			h = n & 1;
			if (n) {
				f = j;
				j = 16
			} else j = 15
		} else {
			h = 0;
			j = 15
		}
		if ((j | 0) == 15 ? (536870903 / (k >>> 0) | 0) >>> 0 >= i >>> 0 : 0) j = 16;
		do
			if ((j | 0) == 16) {
				k = a + 80 | 0;
				if ((c[k >> 2] | 0) >>> 0 < f >>> 0) {
					j = a + 76 | 0;
					i = mc(c[j >> 2] | 0, f << 2) | 0;
					if (!i) break;
					c[j >> 2] = i;
					c[k >> 2] = f
				}
				f = a + 44 | 0;
				e = a + 76 | 0;
				do
					if (!h) {
						k = -4;
						while (1) {
							i = c[o >> 2] | 0;
							h = c[q >> 2] | 0;
							if ((k | 0) >= ((_(i, h) | 0) + 4 | 0)) break;
							l = +fc(+g[f >> 2], +(k | 0) / +(i >>> 0) - +(h >>> 1 >>> 0), h, c[18852 + ((c[d >> 2] | 0) * 20 | 0) + 16 >> 2] | 0);
							g[(c[e >> 2] | 0) + (k + 4 << 2) >> 2] = l;
							k = k + 1 | 0
						}
						e = a + 84 | 0;
						if ((c[d >> 2] | 0) > 8) {
							c[e >> 2] = 4;
							break
						} else {
							c[e >> 2] = 5;
							break
						}
					} else {
						i = 0;
						while (1) {
							if (i >>> 0 >= (c[b >> 2] | 0) >>> 0) break;
							l = +(i >>> 0);
							j = 0;
							while (1) {
								k = c[q >> 2] | 0;
								if (j >>> 0 >= k >>> 0) break;
								t = +fc(+g[f >> 2], +(j - ((k | 0) / 2 | 0) + 1 | 0) - l / +((c[b >> 2] | 0) >>> 0), k, c[18852 + ((c[d >> 2] | 0) * 20 | 0) + 16 >> 2] | 0);
								n = (_(i, k) | 0) + j | 0;
								g[(c[e >> 2] | 0) + (n << 2) >> 2] = t;
								j = j + 1 | 0
							}
							i = i + 1 | 0
						}
						e = a + 84 | 0;
						if ((c[d >> 2] | 0) > 8) {
							c[e >> 2] = 2;
							break
						} else {
							c[e >> 2] = 3;
							break
						}
					}
				while (0);
				b = (c[q >> 2] | 0) + -1 + (c[a + 32 >> 2] | 0) | 0;
				e = c[s >> 2] | 0;
				if (b >>> 0 > e >>> 0) {
					f = c[a + 20 >> 2] | 0;
					if ((536870911 / (f >>> 0) | 0) >>> 0 < b >>> 0) break;
					e = a + 72 | 0;
					f = mc(c[e >> 2] | 0, (_(f, b) | 0) << 2) | 0;
					if (!f) break;
					c[e >> 2] = f;
					c[s >> 2] = b
				} else b = e;
				if (!(c[a + 56 >> 2] | 0)) {
					f = a + 20 | 0;
					e = a + 72 | 0;
					d = 0;
					while (1) {
						if (d >>> 0 >= (_(c[f >> 2] | 0, b) | 0) >>> 0) {
							b = 0;
							break
						}
						g[(c[e >> 2] | 0) + (d << 2) >> 2] = 0.0;
						b = c[s >> 2] | 0;
						d = d + 1 | 0
					}
					return b | 0
				}
				e = c[q >> 2] | 0;
				if (e >>> 0 <= r >>> 0) {
					if (e >>> 0 >= r >>> 0) {
						n = 0;
						return n | 0
					}
					j = a + 20 | 0;
					k = a + 68 | 0;
					f = a + 72 | 0;
					h = 0;
					while (1) {
						if (h >>> 0 >= (c[j >> 2] | 0) >>> 0) {
							b = 0;
							break
						}
						i = (c[k >> 2] | 0) + (h << 2) | 0;
						e = c[i >> 2] | 0;
						c[i >> 2] = (r - (c[q >> 2] | 0) | 0) >>> 1;
						i = 0;
						while (1) {
							d = (c[k >> 2] | 0) + (h << 2) | 0;
							b = c[d >> 2] | 0;
							if (i >>> 0 >= ((c[q >> 2] | 0) + -1 + b + e | 0) >>> 0) break;
							n = (_(h, c[s >> 2] | 0) | 0) + i | 0;
							m = c[f >> 2] | 0;
							c[m + (n << 2) >> 2] = c[m + (n + b << 2) >> 2];
							i = i + 1 | 0
						}
						c[d >> 2] = b + e;
						h = h + 1 | 0
					}
					return b | 0
				}
				d = a + 68 | 0;
				b = r + -1 | 0;
				m = a + 72 | 0;
				n = a + 60 | 0;
				o = r + -1 | 0;
				f = c[a + 20 >> 2] | 0;
				a: while (1) {
					e = f + -1 | 0;
					if (!f) {
						b = 0;
						break
					}
					f = c[(c[d >> 2] | 0) + (e << 2) >> 2] | 0;
					h = f << 1;
					k = _(e, p) | 0;
					i = b + f | 0;
					while (1) {
						j = i + -1 | 0;
						if (!i) {
							k = 0;
							break
						}
						a = c[m >> 2] | 0;
						i = (_(e, c[s >> 2] | 0) | 0) + j | 0;
						c[a + (i + (c[(c[d >> 2] | 0) + (e << 2) >> 2] | 0) << 2) >> 2] = c[a + (k + j << 2) >> 2];
						i = j
					}
					while (1) {
						j = (c[d >> 2] | 0) + (e << 2) | 0;
						if (k >>> 0 >= (c[j >> 2] | 0) >>> 0) break;
						j = (_(e, c[s >> 2] | 0) | 0) + k | 0;
						g[(c[m >> 2] | 0) + (j << 2) >> 2] = 0.0;
						k = k + 1 | 0
					}
					h = r + h | 0;
					c[j >> 2] = 0;
					k = c[q >> 2] | 0;
					if (h >>> 0 >= k >>> 0) {
						c[(c[d >> 2] | 0) + (e << 2) >> 2] = (h - k | 0) >>> 1;
						k = 0;
						while (1) {
							i = c[(c[d >> 2] | 0) + (e << 2) >> 2] | 0;
							if (k >>> 0 >= ((c[q >> 2] | 0) + -1 + i | 0) >>> 0) {
								f = e;
								continue a
							}
							j = (_(e, c[s >> 2] | 0) | 0) + k | 0;
							h = c[m >> 2] | 0;
							c[h + (j << 2) >> 2] = c[h + (j + i << 2) >> 2];
							k = k + 1 | 0
						}
					}
					i = h + -2 | 0;
					j = o + (f << 1) | 0;
					k = 0;
					while (1) {
						if ((k | 0) == (j | 0)) break;
						f = _(e, c[s >> 2] | 0) | 0;
						a = c[m >> 2] | 0;
						c[a + (f + ((c[q >> 2] | 0) + -2 - k) << 2) >> 2] = c[a + (f + (i - k) << 2) >> 2];
						k = k + 1 | 0
					}
					while (1) {
						k = c[q >> 2] | 0;
						if (j >>> 0 >= (k + -1 | 0) >>> 0) break;
						k = (_(e, c[s >> 2] | 0) | 0) + (k + -2 - j) | 0;
						g[(c[m >> 2] | 0) + (k << 2) >> 2] = 0.0;
						j = j + 1 | 0
					}
					f = (c[n >> 2] | 0) + (e << 2) | 0;
					c[f >> 2] = (c[f >> 2] | 0) + ((k - h | 0) >>> 1);
					f = e
				}
				return b | 0
			}
		while (0);
		c[a + 84 >> 2] = 1;
		c[q >> 2] = r;
		n = 1;
		return n | 0
	}

	function dc(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0;
		h = c[a + 24 >> 2] | 0;
		i = c[a + 72 >> 2] | 0;
		j = _(c[a + 28 >> 2] | 0, b) | 0;
		c[a + 56 >> 2] = 1;
		g = ya[c[a + 84 >> 2] & 7](a, b, i + (j << 2) | 0, d, e, f) | 0;
		e = a + 60 | 0;
		a = c[(c[e >> 2] | 0) + (b << 2) >> 2] | 0;
		if ((a | 0) < (c[d >> 2] | 0)) c[d >> 2] = a;
		c[f >> 2] = g;
		e = (c[e >> 2] | 0) + (b << 2) | 0;
		c[e >> 2] = (c[e >> 2] | 0) - (c[d >> 2] | 0);
		e = c[d >> 2] | 0;
		g = h + -1 | 0;
		a = 0;
		while (1) {
			if ((a | 0) >= (g | 0)) break;
			c[i + (j + a << 2) >> 2] = c[i + (j + (a + e) << 2) >> 2];
			a = a + 1 | 0
		}
		return
	}

	function ec(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		l = a + 60 | 0;
		o = a + 64 | 0;
		p = c[a + 92 >> 2] | 0;
		m = c[a + 36 >> 2] | 0;
		n = c[a + 40 >> 2] | 0;
		j = c[a + 12 >> 2] | 0;
		a = c[(c[l >> 2] | 0) + (b << 2) >> 2] | 0;
		i = 0;
		d = c[(c[o >> 2] | 0) + (b << 2) >> 2] | 0;
		while (1) {
			if ((a | 0) >= (c[e >> 2] | 0)) break;
			if ((i | 0) >= (c[h >> 2] | 0)) break;
			k = i + 1 | 0;
			g[f + ((_(p, i) | 0) << 2) >> 2] = 0.0;
			a = a + m | 0;
			d = d + n | 0;
			if (d >>> 0 < j >>> 0) {
				i = k;
				continue
			}
			a = a + 1 | 0;
			i = k;
			d = d - j | 0
		}
		c[(c[l >> 2] | 0) + (b << 2) >> 2] = a;
		c[(c[o >> 2] | 0) + (b << 2) >> 2] = d;
		return i | 0
	}

	function fc(a, b, d, e) {
		a = +a;
		b = +b;
		d = d | 0;
		e = e | 0;
		var f = 0.0,
			i = 0.0,
			j = 0.0,
			l = 0.0;
		i = +N(+b);
		if (i < 1.0e-06) {
			d = (g[k >> 2] = a, c[k >> 2] | 0);
			f = (c[k >> 2] = d, +g[k >> 2]);
			return +f
		}
		f = +(d | 0);
		if (i > f * .5) {
			d = 0;
			f = (c[k >> 2] = d, +g[k >> 2]);
			return +f
		}
		j = b * a * 3.141592653589793;
		j = a * +R(+j) / j;
		i = +N(+(b * 2.0 / f));
		i = +(c[e + 4 >> 2] | 0) * i;
		d = ~~+M(+i);
		i = i - +(d | 0);
		l = i;
		b = i * i;
		i = b * i;
		a = i * .1666666667;
		f = l * -.1666666667 + a;
		b = b * .5;
		i = l + b - i * .5;
		a = l * -.3333333333 + b - a;
		e = c[e >> 2] | 0;
		d = (g[k >> 2] = j * (a * +h[e + (d << 3) >> 3] + (1.0 - f - i - a) * +h[e + (d + 1 << 3) >> 3] + i * +h[e + (d + 2 << 3) >> 3] + f * +h[e + (d + 3 << 3) >> 3]), c[k >> 2] | 0);
		f = (c[k >> 2] = d, +g[k >> 2]);
		return +f
	}

	function gc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0;
		r = c[a + 24 >> 2] | 0;
		w = a + 60 | 0;
		x = a + 64 | 0;
		s = c[a + 92 >> 2] | 0;
		t = c[a + 36 >> 2] | 0;
		u = c[a + 40 >> 2] | 0;
		v = c[a + 12 >> 2] | 0;
		o = c[a + 76 >> 2] | 0;
		p = c[(c[w >> 2] | 0) + (b << 2) >> 2] | 0;
		q = 0;
		i = c[(c[x >> 2] | 0) + (b << 2) >> 2] | 0;
		while (1) {
			if ((p | 0) >= (c[e >> 2] | 0)) {
				a = 9;
				break
			}
			if ((q | 0) >= (c[h >> 2] | 0)) {
				a = 9;
				break
			}
			a = _(i, r) | 0;
			k = 0.0;
			l = 0.0;
			m = 0.0;
			n = 0.0;
			j = 0;
			while (1) {
				if ((j | 0) >= (r | 0)) break;
				z = j | 1;
				y = j | 2;
				A = j | 3;
				k = k + +g[o + (a + j << 2) >> 2] * +g[d + (p + j << 2) >> 2];
				l = l + +g[o + (a + A << 2) >> 2] * +g[d + (p + A << 2) >> 2];
				m = m + +g[o + (a + z << 2) >> 2] * +g[d + (p + z << 2) >> 2];
				n = n + +g[o + (a + y << 2) >> 2] * +g[d + (p + y << 2) >> 2];
				j = j + 4 | 0
			}
			j = q + 1 | 0;
			g[f + ((_(s, q) | 0) << 2) >> 2] = k + m + n + l;
			a = p + t | 0;
			i = i + u | 0;
			if (i >>> 0 < v >>> 0) {
				p = a;
				q = j;
				continue
			}
			p = a + 1 | 0;
			q = j;
			i = i - v | 0
		}
		if ((a | 0) == 9) {
			c[(c[w >> 2] | 0) + (b << 2) >> 2] = p;
			c[(c[x >> 2] | 0) + (b << 2) >> 2] = i;
			return q | 0
		}
		return 0
	}

	function hc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0;
		p = c[a + 24 >> 2] | 0;
		u = a + 60 | 0;
		v = a + 64 | 0;
		q = c[a + 92 >> 2] | 0;
		r = c[a + 36 >> 2] | 0;
		s = c[a + 40 >> 2] | 0;
		t = c[a + 12 >> 2] | 0;
		m = c[a + 76 >> 2] | 0;
		n = c[(c[u >> 2] | 0) + (b << 2) >> 2] | 0;
		o = 0;
		i = c[(c[v >> 2] | 0) + (b << 2) >> 2] | 0;
		while (1) {
			if ((n | 0) >= (c[e >> 2] | 0)) {
				a = 9;
				break
			}
			if ((o | 0) >= (c[h >> 2] | 0)) {
				a = 9;
				break
			}
			a = _(i, p) | 0;
			j = 0;
			l = 0;
			while (1) {
				if ((j | 0) >= (p | 0)) break;
				w = (g[k >> 2] = (c[k >> 2] = l, +g[k >> 2]) + +g[m + (a + j << 2) >> 2] * +g[d + (n + j << 2) >> 2], c[k >> 2] | 0);
				j = j + 1 | 0;
				l = w
			}
			j = o + 1 | 0;
			c[f + ((_(q, o) | 0) << 2) >> 2] = l;
			a = n + r | 0;
			i = i + s | 0;
			if (i >>> 0 < t >>> 0) {
				n = a;
				o = j;
				continue
			}
			n = a + 1 | 0;
			o = j;
			i = i - t | 0
		}
		if ((a | 0) == 9) {
			c[(c[u >> 2] | 0) + (b << 2) >> 2] = n;
			c[(c[v >> 2] | 0) + (b << 2) >> 2] = i;
			return o | 0
		}
		return 0
	}

	function ic(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0.0,
			o = 0.0,
			p = 0.0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0.0,
			H = 0.0,
			I = 0.0,
			J = 0.0;
		u = c[a + 24 >> 2] | 0;
		B = a + 60 | 0;
		C = a + 64 | 0;
		v = c[a + 92 >> 2] | 0;
		w = c[a + 36 >> 2] | 0;
		x = c[a + 40 >> 2] | 0;
		y = a + 12 | 0;
		z = c[y >> 2] | 0;
		A = a + 48 | 0;
		r = a + 76 | 0;
		s = c[(c[B >> 2] | 0) + (b << 2) >> 2] | 0;
		t = 0;
		i = c[(c[C >> 2] | 0) + (b << 2) >> 2] | 0;
		while (1) {
			if ((s | 0) >= (c[e >> 2] | 0)) {
				a = 9;
				break
			}
			if ((t | 0) >= (c[h >> 2] | 0)) {
				a = 9;
				break
			}
			j = c[A >> 2] | 0;
			k = _(i, j) | 0;
			m = c[y >> 2] | 0;
			a = (k >>> 0) / (m >>> 0) | 0;
			k = (k >>> 0) % (m >>> 0) | 0;
			l = +(m >>> 0);
			n = 0.0;
			o = 0.0;
			p = 0.0;
			q = 0.0;
			m = 0;
			while (1) {
				if ((m | 0) >= (u | 0)) break;
				G = +g[d + (s + m << 2) >> 2];
				D = m + 1 | 0;
				E = (_(D, j) | 0) + 4 - a | 0;
				F = c[r >> 2] | 0;
				n = n + G * +g[F + (E + -2 << 2) >> 2];
				o = o + G * +g[F + (E + 1 << 2) >> 2];
				p = p + G * +g[F + (E + -1 << 2) >> 2];
				q = q + G * +g[F + (E << 2) >> 2];
				m = D
			}
			J = +(k >>> 0) / l;
			l = J * .16666999459266663 * J * J;
			I = J * .5 * J;
			H = J * -.16666999459266663 + l;
			G = J + I - I * J;
			l = J * -.3333300054073334 + I - l;
			j = t + 1 | 0;
			g[f + ((_(v, t) | 0) << 2) >> 2] = H * n + G * p + (1.0 - H - G - l) * q + l * o;
			a = s + w | 0;
			i = i + x | 0;
			if (i >>> 0 < z >>> 0) {
				s = a;
				t = j;
				continue
			}
			s = a + 1 | 0;
			t = j;
			i = i - z | 0
		}
		if ((a | 0) == 9) {
			c[(c[B >> 2] | 0) + (b << 2) >> 2] = s;
			c[(c[C >> 2] | 0) + (b << 2) >> 2] = i;
			return t | 0
		}
		return 0
	}

	function jc(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0.0,
			o = 0.0,
			p = 0.0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0.0,
			H = 0.0,
			I = 0.0,
			J = 0.0;
		u = c[a + 24 >> 2] | 0;
		B = a + 60 | 0;
		C = a + 64 | 0;
		v = c[a + 92 >> 2] | 0;
		w = c[a + 36 >> 2] | 0;
		x = c[a + 40 >> 2] | 0;
		y = a + 12 | 0;
		z = c[y >> 2] | 0;
		A = a + 48 | 0;
		r = a + 76 | 0;
		s = c[(c[B >> 2] | 0) + (b << 2) >> 2] | 0;
		t = 0;
		i = c[(c[C >> 2] | 0) + (b << 2) >> 2] | 0;
		while (1) {
			if ((s | 0) >= (c[e >> 2] | 0)) {
				a = 9;
				break
			}
			if ((t | 0) >= (c[h >> 2] | 0)) {
				a = 9;
				break
			}
			j = c[A >> 2] | 0;
			k = _(i, j) | 0;
			m = c[y >> 2] | 0;
			a = (k >>> 0) / (m >>> 0) | 0;
			k = (k >>> 0) % (m >>> 0) | 0;
			l = +(m >>> 0);
			n = 0.0;
			o = 0.0;
			p = 0.0;
			q = 0.0;
			m = 0;
			while (1) {
				if ((m | 0) >= (u | 0)) break;
				G = +g[d + (s + m << 2) >> 2];
				D = m + 1 | 0;
				E = (_(D, j) | 0) + 4 - a | 0;
				F = c[r >> 2] | 0;
				n = n + G * +g[F + (E + -2 << 2) >> 2];
				o = o + G * +g[F + (E + 1 << 2) >> 2];
				p = p + G * +g[F + (E + -1 << 2) >> 2];
				q = q + G * +g[F + (E << 2) >> 2];
				m = D
			}
			J = +(k >>> 0) / l;
			l = J * .16666999459266663 * J * J;
			H = J * -.16666999459266663 + l;
			I = J * .5 * J;
			G = J + I - I * J;
			l = J * -.3333300054073334 + I - l;
			j = t + 1 | 0;
			g[f + ((_(v, t) | 0) << 2) >> 2] = H * n + G * p + (1.0 - H - G - l) * q + l * o;
			a = s + w | 0;
			i = i + x | 0;
			if (i >>> 0 < z >>> 0) {
				s = a;
				t = j;
				continue
			}
			s = a + 1 | 0;
			t = j;
			i = i - z | 0
		}
		if ((a | 0) == 9) {
			c[(c[B >> 2] | 0) + (b << 2) >> 2] = s;
			c[(c[C >> 2] | 0) + (b << 2) >> 2] = i;
			return t | 0
		}
		return 0
	}

	function kc(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0;
		do
			if (a >>> 0 < 245) {
				q = a >>> 0 < 11 ? 16 : a + 11 & -8;
				a = q >>> 3;
				k = c[4787] | 0;
				j = k >>> a;
				if (j & 3) {
					e = (j & 1 ^ 1) + a | 0;
					b = e << 1;
					d = 19188 + (b << 2) | 0;
					b = 19188 + (b + 2 << 2) | 0;
					f = c[b >> 2] | 0;
					g = f + 8 | 0;
					h = c[g >> 2] | 0;
					do
						if ((d | 0) == (h | 0)) c[4787] = k & ~(1 << e);
						else {
							if (h >>> 0 >= (c[4791] | 0) >>> 0 ? (l = h + 12 | 0, (c[l >> 2] | 0) == (f | 0)) : 0) {
								c[l >> 2] = d;
								c[b >> 2] = h;
								break
							}
							la()
						}
					while (0);
					w = e << 3;
					c[f + 4 >> 2] = w | 3;
					w = f + (w | 4) | 0;
					c[w >> 2] = c[w >> 2] | 1;
					break
				}
				b = c[4789] | 0;
				if (q >>> 0 > b >>> 0) {
					if (j) {
						f = 2 << a;
						f = j << a & (f | 0 - f);
						f = (f & 0 - f) + -1 | 0;
						g = f >>> 12 & 16;
						f = f >>> g;
						e = f >>> 5 & 8;
						f = f >>> e;
						d = f >>> 2 & 4;
						f = f >>> d;
						h = f >>> 1 & 2;
						f = f >>> h;
						i = f >>> 1 & 1;
						i = (e | g | d | h | i) + (f >>> i) | 0;
						f = i << 1;
						h = 19188 + (f << 2) | 0;
						f = 19188 + (f + 2 << 2) | 0;
						d = c[f >> 2] | 0;
						g = d + 8 | 0;
						e = c[g >> 2] | 0;
						do
							if ((h | 0) == (e | 0)) {
								c[4787] = k & ~(1 << i);
								n = b
							} else {
								if (e >>> 0 >= (c[4791] | 0) >>> 0 ? (m = e + 12 | 0, (c[m >> 2] | 0) == (d | 0)) : 0) {
									c[m >> 2] = h;
									c[f >> 2] = e;
									n = c[4789] | 0;
									break
								}
								la()
							}
						while (0);
						w = i << 3;
						b = w - q | 0;
						c[d + 4 >> 2] = q | 3;
						j = d + q | 0;
						c[d + (q | 4) >> 2] = b | 1;
						c[d + w >> 2] = b;
						if (n) {
							d = c[4792] | 0;
							e = n >>> 3;
							h = e << 1;
							i = 19188 + (h << 2) | 0;
							f = c[4787] | 0;
							e = 1 << e;
							if (f & e) {
								f = 19188 + (h + 2 << 2) | 0;
								h = c[f >> 2] | 0;
								if (h >>> 0 < (c[4791] | 0) >>> 0) la();
								else {
									o = f;
									p = h
								}
							} else {
								c[4787] = f | e;
								o = 19188 + (h + 2 << 2) | 0;
								p = i
							}
							c[o >> 2] = d;
							c[p + 12 >> 2] = d;
							c[d + 8 >> 2] = p;
							c[d + 12 >> 2] = i
						}
						c[4789] = b;
						c[4792] = j;
						break
					}
					a = c[4788] | 0;
					if (a) {
						b = (a & 0 - a) + -1 | 0;
						s = b >>> 12 & 16;
						b = b >>> s;
						p = b >>> 5 & 8;
						b = b >>> p;
						w = b >>> 2 & 4;
						b = b >>> w;
						h = b >>> 1 & 2;
						b = b >>> h;
						k = b >>> 1 & 1;
						k = c[19452 + ((p | s | w | h | k) + (b >>> k) << 2) >> 2] | 0;
						b = (c[k + 4 >> 2] & -8) - q | 0;
						h = k;
						while (1) {
							i = c[h + 16 >> 2] | 0;
							if (!i) {
								i = c[h + 20 >> 2] | 0;
								if (!i) break
							}
							h = (c[i + 4 >> 2] & -8) - q | 0;
							w = h >>> 0 < b >>> 0;
							b = w ? h : b;
							h = i;
							k = w ? i : k
						}
						a = c[4791] | 0;
						if (k >>> 0 >= a >>> 0 ? (u = k + q | 0, k >>> 0 < u >>> 0) : 0) {
							j = c[k + 24 >> 2] | 0;
							i = c[k + 12 >> 2] | 0;
							do
								if ((i | 0) == (k | 0)) {
									h = k + 20 | 0;
									i = c[h >> 2] | 0;
									if (!i) {
										h = k + 16 | 0;
										i = c[h >> 2] | 0;
										if (!i) {
											r = 0;
											break
										}
									}
									while (1) {
										g = i + 20 | 0;
										f = c[g >> 2] | 0;
										if (f) {
											i = f;
											h = g;
											continue
										}
										g = i + 16 | 0;
										f = c[g >> 2] | 0;
										if (!f) break;
										else {
											i = f;
											h = g
										}
									}
									if (h >>> 0 < a >>> 0) la();
									else {
										c[h >> 2] = 0;
										r = i;
										break
									}
								} else {
									h = c[k + 8 >> 2] | 0;
									if ((h >>> 0 >= a >>> 0 ? (d = h + 12 | 0, (c[d >> 2] | 0) == (k | 0)) : 0) ? (e = i + 8 | 0, (c[e >> 2] | 0) == (k | 0)) : 0) {
										c[d >> 2] = i;
										c[e >> 2] = h;
										r = i;
										break
									}
									la()
								}
							while (0);
							do
								if (j) {
									h = c[k + 28 >> 2] | 0;
									g = 19452 + (h << 2) | 0;
									if ((k | 0) == (c[g >> 2] | 0)) {
										c[g >> 2] = r;
										if (!r) {
											c[4788] = c[4788] & ~(1 << h);
											break
										}
									} else {
										if (j >>> 0 < (c[4791] | 0) >>> 0) la();
										h = j + 16 | 0;
										if ((c[h >> 2] | 0) == (k | 0)) c[h >> 2] = r;
										else c[j + 20 >> 2] = r;
										if (!r) break
									}
									g = c[4791] | 0;
									if (r >>> 0 < g >>> 0) la();
									c[r + 24 >> 2] = j;
									h = c[k + 16 >> 2] | 0;
									do
										if (h)
											if (h >>> 0 < g >>> 0) la();
											else {
												c[r + 16 >> 2] = h;
												c[h + 24 >> 2] = r;
												break
											}
									while (0);
									h = c[k + 20 >> 2] | 0;
									if (h)
										if (h >>> 0 < (c[4791] | 0) >>> 0) la();
										else {
											c[r + 20 >> 2] = h;
											c[h + 24 >> 2] = r;
											break
										}
								}
							while (0);
							if (b >>> 0 < 16) {
								w = b + q | 0;
								c[k + 4 >> 2] = w | 3;
								w = k + (w + 4) | 0;
								c[w >> 2] = c[w >> 2] | 1
							} else {
								c[k + 4 >> 2] = q | 3;
								c[k + (q | 4) >> 2] = b | 1;
								c[k + (b + q) >> 2] = b;
								e = c[4789] | 0;
								if (e) {
									d = c[4792] | 0;
									f = e >>> 3;
									h = f << 1;
									i = 19188 + (h << 2) | 0;
									g = c[4787] | 0;
									f = 1 << f;
									if (g & f) {
										h = 19188 + (h + 2 << 2) | 0;
										g = c[h >> 2] | 0;
										if (g >>> 0 < (c[4791] | 0) >>> 0) la();
										else {
											t = h;
											v = g
										}
									} else {
										c[4787] = g | f;
										t = 19188 + (h + 2 << 2) | 0;
										v = i
									}
									c[t >> 2] = d;
									c[v + 12 >> 2] = d;
									c[d + 8 >> 2] = v;
									c[d + 12 >> 2] = i
								}
								c[4789] = b;
								c[4792] = u
							}
							g = k + 8 | 0;
							break
						}
						la()
					} else {
						A = q;
						S = 154
					}
				} else {
					A = q;
					S = 154
				}
			} else if (a >>> 0 <= 4294967231) {
			a = a + 11 | 0;
			l = a & -8;
			b = c[4788] | 0;
			if (b) {
				j = 0 - l | 0;
				a = a >>> 8;
				if (a)
					if (l >>> 0 > 16777215) k = 31;
					else {
						u = (a + 1048320 | 0) >>> 16 & 8;
						v = a << u;
						t = (v + 520192 | 0) >>> 16 & 4;
						v = v << t;
						k = (v + 245760 | 0) >>> 16 & 2;
						k = 14 - (t | u | k) + (v << k >>> 15) | 0;
						k = l >>> (k + 7 | 0) & 1 | k << 1
					}
				else k = 0;
				a = c[19452 + (k << 2) >> 2] | 0;
				a: do
					if (!a) {
						i = 0;
						a = 0;
						S = 86
					} else {
						f = j;
						i = 0;
						e = l << ((k | 0) == 31 ? 0 : 25 - (k >>> 1) | 0);
						d = a;
						a = 0;
						while (1) {
							h = c[d + 4 >> 2] & -8;
							j = h - l | 0;
							if (j >>> 0 < f >>> 0)
								if ((h | 0) == (l | 0)) {
									h = d;
									a = d;
									S = 90;
									break a
								} else a = d;
							else j = f;
							v = c[d + 20 >> 2] | 0;
							d = c[d + 16 + (e >>> 31 << 2) >> 2] | 0;
							i = (v | 0) == 0 | (v | 0) == (d | 0) ? i : v;
							if (!d) {
								S = 86;
								break
							} else {
								f = j;
								e = e << 1
							}
						}
					}
				while (0);
				if ((S | 0) == 86) {
					if ((i | 0) == 0 & (a | 0) == 0) {
						a = 2 << k;
						a = b & (a | 0 - a);
						if (!a) {
							A = l;
							S = 154;
							break
						}
						a = (a & 0 - a) + -1 | 0;
						t = a >>> 12 & 16;
						a = a >>> t;
						r = a >>> 5 & 8;
						a = a >>> r;
						u = a >>> 2 & 4;
						a = a >>> u;
						v = a >>> 1 & 2;
						a = a >>> v;
						i = a >>> 1 & 1;
						i = c[19452 + ((r | t | u | v | i) + (a >>> i) << 2) >> 2] | 0;
						a = 0
					}
					if (!i) {
						p = j;
						o = a
					} else {
						h = i;
						S = 90
					}
				}
				if ((S | 0) == 90)
					while (1) {
						S = 0;
						v = (c[h + 4 >> 2] & -8) - l | 0;
						i = v >>> 0 < j >>> 0;
						j = i ? v : j;
						a = i ? h : a;
						i = c[h + 16 >> 2] | 0;
						if (i) {
							h = i;
							S = 90;
							continue
						}
						h = c[h + 20 >> 2] | 0;
						if (!h) {
							p = j;
							o = a;
							break
						} else S = 90
					}
				if ((o | 0) != 0 ? p >>> 0 < ((c[4789] | 0) - l | 0) >>> 0 : 0) {
					a = c[4791] | 0;
					if (o >>> 0 >= a >>> 0 ? (C = o + l | 0, o >>> 0 < C >>> 0) : 0) {
						j = c[o + 24 >> 2] | 0;
						i = c[o + 12 >> 2] | 0;
						do
							if ((i | 0) == (o | 0)) {
								h = o + 20 | 0;
								i = c[h >> 2] | 0;
								if (!i) {
									h = o + 16 | 0;
									i = c[h >> 2] | 0;
									if (!i) {
										w = 0;
										break
									}
								}
								while (1) {
									g = i + 20 | 0;
									f = c[g >> 2] | 0;
									if (f) {
										i = f;
										h = g;
										continue
									}
									g = i + 16 | 0;
									f = c[g >> 2] | 0;
									if (!f) break;
									else {
										i = f;
										h = g
									}
								}
								if (h >>> 0 < a >>> 0) la();
								else {
									c[h >> 2] = 0;
									w = i;
									break
								}
							} else {
								h = c[o + 8 >> 2] | 0;
								if ((h >>> 0 >= a >>> 0 ? (q = h + 12 | 0, (c[q >> 2] | 0) == (o | 0)) : 0) ? (s = i + 8 | 0, (c[s >> 2] | 0) == (o | 0)) : 0) {
									c[q >> 2] = i;
									c[s >> 2] = h;
									w = i;
									break
								}
								la()
							}
						while (0);
						do
							if (j) {
								i = c[o + 28 >> 2] | 0;
								h = 19452 + (i << 2) | 0;
								if ((o | 0) == (c[h >> 2] | 0)) {
									c[h >> 2] = w;
									if (!w) {
										c[4788] = c[4788] & ~(1 << i);
										break
									}
								} else {
									if (j >>> 0 < (c[4791] | 0) >>> 0) la();
									h = j + 16 | 0;
									if ((c[h >> 2] | 0) == (o | 0)) c[h >> 2] = w;
									else c[j + 20 >> 2] = w;
									if (!w) break
								}
								i = c[4791] | 0;
								if (w >>> 0 < i >>> 0) la();
								c[w + 24 >> 2] = j;
								h = c[o + 16 >> 2] | 0;
								do
									if (h)
										if (h >>> 0 < i >>> 0) la();
										else {
											c[w + 16 >> 2] = h;
											c[h + 24 >> 2] = w;
											break
										}
								while (0);
								h = c[o + 20 >> 2] | 0;
								if (h)
									if (h >>> 0 < (c[4791] | 0) >>> 0) la();
									else {
										c[w + 20 >> 2] = h;
										c[h + 24 >> 2] = w;
										break
									}
							}
						while (0);
						b: do
							if (p >>> 0 >= 16) {
								c[o + 4 >> 2] = l | 3;
								c[o + (l | 4) >> 2] = p | 1;
								c[o + (p + l) >> 2] = p;
								i = p >>> 3;
								if (p >>> 0 < 256) {
									g = i << 1;
									e = 19188 + (g << 2) | 0;
									f = c[4787] | 0;
									h = 1 << i;
									if (f & h) {
										h = 19188 + (g + 2 << 2) | 0;
										g = c[h >> 2] | 0;
										if (g >>> 0 < (c[4791] | 0) >>> 0) la();
										else {
											y = h;
											z = g
										}
									} else {
										c[4787] = f | h;
										y = 19188 + (g + 2 << 2) | 0;
										z = e
									}
									c[y >> 2] = C;
									c[z + 12 >> 2] = C;
									c[o + (l + 8) >> 2] = z;
									c[o + (l + 12) >> 2] = e;
									break
								}
								d = p >>> 8;
								if (d)
									if (p >>> 0 > 16777215) i = 31;
									else {
										v = (d + 1048320 | 0) >>> 16 & 8;
										w = d << v;
										u = (w + 520192 | 0) >>> 16 & 4;
										w = w << u;
										i = (w + 245760 | 0) >>> 16 & 2;
										i = 14 - (u | v | i) + (w << i >>> 15) | 0;
										i = p >>> (i + 7 | 0) & 1 | i << 1
									}
								else i = 0;
								h = 19452 + (i << 2) | 0;
								c[o + (l + 28) >> 2] = i;
								c[o + (l + 20) >> 2] = 0;
								c[o + (l + 16) >> 2] = 0;
								g = c[4788] | 0;
								f = 1 << i;
								if (!(g & f)) {
									c[4788] = g | f;
									c[h >> 2] = C;
									c[o + (l + 24) >> 2] = h;
									c[o + (l + 12) >> 2] = C;
									c[o + (l + 8) >> 2] = C;
									break
								}
								h = c[h >> 2] | 0;
								c: do
									if ((c[h + 4 >> 2] & -8 | 0) != (p | 0)) {
										i = p << ((i | 0) == 31 ? 0 : 25 - (i >>> 1) | 0);
										while (1) {
											f = h + 16 + (i >>> 31 << 2) | 0;
											g = c[f >> 2] | 0;
											if (!g) break;
											if ((c[g + 4 >> 2] & -8 | 0) == (p | 0)) {
												A = g;
												break c
											} else {
												i = i << 1;
												h = g
											}
										}
										if (f >>> 0 < (c[4791] | 0) >>> 0) la();
										else {
											c[f >> 2] = C;
											c[o + (l + 24) >> 2] = h;
											c[o + (l + 12) >> 2] = C;
											c[o + (l + 8) >> 2] = C;
											break b
										}
									} else A = h;
								while (0);
								d = A + 8 | 0;
								b = c[d >> 2] | 0;
								w = c[4791] | 0;
								if (b >>> 0 >= w >>> 0 & A >>> 0 >= w >>> 0) {
									c[b + 12 >> 2] = C;
									c[d >> 2] = C;
									c[o + (l + 8) >> 2] = b;
									c[o + (l + 12) >> 2] = A;
									c[o + (l + 24) >> 2] = 0;
									break
								} else la()
							} else {
								w = p + l | 0;
								c[o + 4 >> 2] = w | 3;
								w = o + (w + 4) | 0;
								c[w >> 2] = c[w >> 2] | 1
							}
						while (0);
						g = o + 8 | 0;
						break
					}
					la()
				} else {
					A = l;
					S = 154
				}
			} else {
				A = l;
				S = 154
			}
		} else {
			A = -1;
			S = 154
		}
		while (0);
		d: do
			if ((S | 0) == 154) {
				a = c[4789] | 0;
				if (a >>> 0 >= A >>> 0) {
					b = a - A | 0;
					d = c[4792] | 0;
					if (b >>> 0 > 15) {
						c[4792] = d + A;
						c[4789] = b;
						c[d + (A + 4) >> 2] = b | 1;
						c[d + a >> 2] = b;
						c[d + 4 >> 2] = A | 3
					} else {
						c[4789] = 0;
						c[4792] = 0;
						c[d + 4 >> 2] = a | 3;
						w = d + (a + 4) | 0;
						c[w >> 2] = c[w >> 2] | 1
					}
					g = d + 8 | 0;
					break
				}
				j = c[4790] | 0;
				if (j >>> 0 > A >>> 0) {
					w = j - A | 0;
					c[4790] = w;
					g = c[4793] | 0;
					c[4793] = g + A;
					c[g + (A + 4) >> 2] = w | 1;
					c[g + 4 >> 2] = A | 3;
					g = g + 8 | 0;
					break
				}
				do
					if (!(c[4905] | 0)) {
						j = wa(30) | 0;
						if (!(j + -1 & j)) {
							c[4907] = j;
							c[4906] = j;
							c[4908] = -1;
							c[4909] = -1;
							c[4910] = 0;
							c[4898] = 0;
							c[4905] = (pa(0) | 0) & -16 ^ 1431655768;
							break
						} else la()
					}
				while (0);
				k = A + 48 | 0;
				h = c[4907] | 0;
				f = A + 47 | 0;
				i = h + f | 0;
				h = 0 - h | 0;
				l = i & h;
				if (l >>> 0 > A >>> 0) {
					a = c[4897] | 0;
					if ((a | 0) != 0 ? (v = c[4895] | 0, w = v + l | 0, w >>> 0 <= v >>> 0 | w >>> 0 > a >>> 0) : 0) {
						g = 0;
						break
					}
					e: do
						if (!(c[4898] & 4)) {
							j = c[4793] | 0;
							f: do
								if (j) {
									g = 19596;
									while (1) {
										a = c[g >> 2] | 0;
										if (a >>> 0 <= j >>> 0 ? (x = g + 4 | 0, (a + (c[x >> 2] | 0) | 0) >>> 0 > j >>> 0) : 0) break;
										a = c[g + 8 >> 2] | 0;
										if (!a) {
											S = 174;
											break f
										} else g = a
									}
									a = i - (c[4790] | 0) & h;
									if (a >>> 0 < 2147483647) {
										i = oa(a | 0) | 0;
										w = (i | 0) == ((c[g >> 2] | 0) + (c[x >> 2] | 0) | 0);
										j = w ? a : 0;
										if (w) {
											if ((i | 0) != (-1 | 0)) {
												z = i;
												q = j;
												S = 194;
												break e
											}
										} else S = 184
									} else j = 0
								} else S = 174;
							while (0);
							do
								if ((S | 0) == 174) {
									h = oa(0) | 0;
									if ((h | 0) != (-1 | 0)) {
										a = h;
										j = c[4906] | 0;
										i = j + -1 | 0;
										if (!(i & a)) a = l;
										else a = l - a + (i + a & 0 - j) | 0;
										j = c[4895] | 0;
										i = j + a | 0;
										if (a >>> 0 > A >>> 0 & a >>> 0 < 2147483647) {
											w = c[4897] | 0;
											if ((w | 0) != 0 ? i >>> 0 <= j >>> 0 | i >>> 0 > w >>> 0 : 0) {
												j = 0;
												break
											}
											i = oa(a | 0) | 0;
											w = (i | 0) == (h | 0);
											j = w ? a : 0;
											if (w) {
												z = h;
												q = j;
												S = 194;
												break e
											} else S = 184
										} else j = 0
									} else j = 0
								}
							while (0);
							g: do
								if ((S | 0) == 184) {
									h = 0 - a | 0;
									do
										if (k >>> 0 > a >>> 0 & (a >>> 0 < 2147483647 & (i | 0) != (-1 | 0)) ? (B = c[4907] | 0, B = f - a + B & 0 - B, B >>> 0 < 2147483647) : 0)
											if ((oa(B | 0) | 0) == (-1 | 0)) {
												oa(h | 0) | 0;
												break g
											} else {
												a = B + a | 0;
												break
											}
									while (0);
									if ((i | 0) != (-1 | 0)) {
										z = i;
										q = a;
										S = 194;
										break e
									}
								}
							while (0);
							c[4898] = c[4898] | 4;
							S = 191
						} else {
							j = 0;
							S = 191
						}
					while (0);
					if ((((S | 0) == 191 ? l >>> 0 < 2147483647 : 0) ? (D = oa(l | 0) | 0, E = oa(0) | 0, D >>> 0 < E >>> 0 & ((D | 0) != (-1 | 0) & (E | 0) != (-1 | 0))) : 0) ? (F = E - D | 0, G = F >>> 0 > (A + 40 | 0) >>> 0, G) : 0) {
						z = D;
						q = G ? F : j;
						S = 194
					}
					if ((S | 0) == 194) {
						i = (c[4895] | 0) + q | 0;
						c[4895] = i;
						if (i >>> 0 > (c[4896] | 0) >>> 0) c[4896] = i;
						p = c[4793] | 0;
						h: do
							if (p) {
								g = 19596;
								while (1) {
									a = c[g >> 2] | 0;
									j = g + 4 | 0;
									i = c[j >> 2] | 0;
									if ((z | 0) == (a + i | 0)) {
										S = 204;
										break
									}
									h = c[g + 8 >> 2] | 0;
									if (!h) break;
									else g = h
								}
								if (((S | 0) == 204 ? (c[g + 12 >> 2] & 8 | 0) == 0 : 0) ? p >>> 0 < z >>> 0 & p >>> 0 >= a >>> 0 : 0) {
									c[j >> 2] = i + q;
									w = (c[4790] | 0) + q | 0;
									v = p + 8 | 0;
									v = (v & 7 | 0) == 0 ? 0 : 0 - v & 7;
									u = w - v | 0;
									c[4793] = p + v;
									c[4790] = u;
									c[p + (v + 4) >> 2] = u | 1;
									c[p + (w + 4) >> 2] = 40;
									c[4794] = c[4909];
									break
								}
								j = c[4791] | 0;
								if (z >>> 0 < j >>> 0) {
									c[4791] = z;
									j = z
								}
								h = z + q | 0;
								i = 19596;
								while (1) {
									if ((c[i >> 2] | 0) == (h | 0)) {
										S = 212;
										break
									}
									i = c[i + 8 >> 2] | 0;
									if (!i) {
										i = 19596;
										break
									}
								}
								if ((S | 0) == 212)
									if (!(c[i + 12 >> 2] & 8)) {
										c[i >> 2] = z;
										n = i + 4 | 0;
										c[n >> 2] = (c[n >> 2] | 0) + q;
										n = z + 8 | 0;
										n = (n & 7 | 0) == 0 ? 0 : 0 - n & 7;
										l = z + (q + 8) | 0;
										l = (l & 7 | 0) == 0 ? 0 : 0 - l & 7;
										i = z + (l + q) | 0;
										o = n + A | 0;
										m = z + o | 0;
										a = i - (z + n) - A | 0;
										c[z + (n + 4) >> 2] = A | 3;
										i: do
											if ((i | 0) != (p | 0)) {
												if ((i | 0) == (c[4792] | 0)) {
													w = (c[4789] | 0) + a | 0;
													c[4789] = w;
													c[4792] = m;
													c[z + (o + 4) >> 2] = w | 1;
													c[z + (w + o) >> 2] = w;
													break
												}
												b = q + 4 | 0;
												h = c[z + (b + l) >> 2] | 0;
												if ((h & 3 | 0) == 1) {
													k = h & -8;
													e = h >>> 3;
													j: do
														if (h >>> 0 >= 256) {
															d = c[z + ((l | 24) + q) >> 2] | 0;
															g = c[z + (q + 12 + l) >> 2] | 0;
															k: do
																if ((g | 0) == (i | 0)) {
																	g = l | 16;
																	f = z + (b + g) | 0;
																	h = c[f >> 2] | 0;
																	if (!h) {
																		g = z + (g + q) | 0;
																		h = c[g >> 2] | 0;
																		if (!h) {
																			O = 0;
																			break
																		}
																	} else g = f;
																	while (1) {
																		f = h + 20 | 0;
																		e = c[f >> 2] | 0;
																		if (e) {
																			h = e;
																			g = f;
																			continue
																		}
																		f = h + 16 | 0;
																		e = c[f >> 2] | 0;
																		if (!e) break;
																		else {
																			h = e;
																			g = f
																		}
																	}
																	if (g >>> 0 < j >>> 0) la();
																	else {
																		c[g >> 2] = 0;
																		O = h;
																		break
																	}
																} else {
																	f = c[z + ((l | 8) + q) >> 2] | 0;
																	do
																		if (f >>> 0 >= j >>> 0) {
																			j = f + 12 | 0;
																			if ((c[j >> 2] | 0) != (i | 0)) break;
																			h = g + 8 | 0;
																			if ((c[h >> 2] | 0) != (i | 0)) break;
																			c[j >> 2] = g;
																			c[h >> 2] = f;
																			O = g;
																			break k
																		}
																	while (0);
																	la()
																}
															while (0);
															if (!d) break;
															j = c[z + (q + 28 + l) >> 2] | 0;
															h = 19452 + (j << 2) | 0;
															do
																if ((i | 0) != (c[h >> 2] | 0)) {
																	if (d >>> 0 < (c[4791] | 0) >>> 0) la();
																	h = d + 16 | 0;
																	if ((c[h >> 2] | 0) == (i | 0)) c[h >> 2] = O;
																	else c[d + 20 >> 2] = O;
																	if (!O) break j
																} else {
																	c[h >> 2] = O;
																	if (O) break;
																	c[4788] = c[4788] & ~(1 << j);
																	break j
																}
															while (0);
															j = c[4791] | 0;
															if (O >>> 0 < j >>> 0) la();
															c[O + 24 >> 2] = d;
															i = l | 16;
															h = c[z + (i + q) >> 2] | 0;
															do
																if (h)
																	if (h >>> 0 < j >>> 0) la();
																	else {
																		c[O + 16 >> 2] = h;
																		c[h + 24 >> 2] = O;
																		break
																	}
															while (0);
															i = c[z + (b + i) >> 2] | 0;
															if (!i) break;
															if (i >>> 0 < (c[4791] | 0) >>> 0) la();
															else {
																c[O + 20 >> 2] = i;
																c[i + 24 >> 2] = O;
																break
															}
														} else {
															h = c[z + ((l | 8) + q) >> 2] | 0;
															g = c[z + (q + 12 + l) >> 2] | 0;
															f = 19188 + (e << 1 << 2) | 0;
															do
																if ((h | 0) != (f | 0)) {
																	if (h >>> 0 >= j >>> 0 ? (c[h + 12 >> 2] | 0) == (i | 0) : 0) break;
																	la()
																}
															while (0);
															if ((g | 0) == (h | 0)) {
																c[4787] = c[4787] & ~(1 << e);
																break
															}
															do
																if ((g | 0) == (f | 0)) J = g + 8 | 0;
																else {
																	if (g >>> 0 >= j >>> 0 ? (K = g + 8 | 0, (c[K >> 2] | 0) == (i | 0)) : 0) {
																		J = K;
																		break
																	}
																	la()
																}
															while (0);
															c[h + 12 >> 2] = g;
															c[J >> 2] = h
														}
													while (0);
													i = z + ((k | l) + q) | 0;
													a = k + a | 0
												}
												i = i + 4 | 0;
												c[i >> 2] = c[i >> 2] & -2;
												c[z + (o + 4) >> 2] = a | 1;
												c[z + (a + o) >> 2] = a;
												i = a >>> 3;
												if (a >>> 0 < 256) {
													g = i << 1;
													e = 19188 + (g << 2) | 0;
													f = c[4787] | 0;
													h = 1 << i;
													do
														if (!(f & h)) {
															c[4787] = f | h;
															P = 19188 + (g + 2 << 2) | 0;
															Q = e
														} else {
															h = 19188 + (g + 2 << 2) | 0;
															g = c[h >> 2] | 0;
															if (g >>> 0 >= (c[4791] | 0) >>> 0) {
																P = h;
																Q = g;
																break
															}
															la()
														}
													while (0);
													c[P >> 2] = m;
													c[Q + 12 >> 2] = m;
													c[z + (o + 8) >> 2] = Q;
													c[z + (o + 12) >> 2] = e;
													break
												}
												d = a >>> 8;
												do
													if (!d) i = 0;
													else {
														if (a >>> 0 > 16777215) {
															i = 31;
															break
														}
														v = (d + 1048320 | 0) >>> 16 & 8;
														w = d << v;
														u = (w + 520192 | 0) >>> 16 & 4;
														w = w << u;
														i = (w + 245760 | 0) >>> 16 & 2;
														i = 14 - (u | v | i) + (w << i >>> 15) | 0;
														i = a >>> (i + 7 | 0) & 1 | i << 1
													}
												while (0);
												h = 19452 + (i << 2) | 0;
												c[z + (o + 28) >> 2] = i;
												c[z + (o + 20) >> 2] = 0;
												c[z + (o + 16) >> 2] = 0;
												g = c[4788] | 0;
												f = 1 << i;
												if (!(g & f)) {
													c[4788] = g | f;
													c[h >> 2] = m;
													c[z + (o + 24) >> 2] = h;
													c[z + (o + 12) >> 2] = m;
													c[z + (o + 8) >> 2] = m;
													break
												}
												h = c[h >> 2] | 0;
												l: do
													if ((c[h + 4 >> 2] & -8 | 0) != (a | 0)) {
														i = a << ((i | 0) == 31 ? 0 : 25 - (i >>> 1) | 0);
														while (1) {
															f = h + 16 + (i >>> 31 << 2) | 0;
															g = c[f >> 2] | 0;
															if (!g) break;
															if ((c[g + 4 >> 2] & -8 | 0) == (a | 0)) {
																R = g;
																break l
															} else {
																i = i << 1;
																h = g
															}
														}
														if (f >>> 0 < (c[4791] | 0) >>> 0) la();
														else {
															c[f >> 2] = m;
															c[z + (o + 24) >> 2] = h;
															c[z + (o + 12) >> 2] = m;
															c[z + (o + 8) >> 2] = m;
															break i
														}
													} else R = h;
												while (0);
												d = R + 8 | 0;
												b = c[d >> 2] | 0;
												w = c[4791] | 0;
												if (b >>> 0 >= w >>> 0 & R >>> 0 >= w >>> 0) {
													c[b + 12 >> 2] = m;
													c[d >> 2] = m;
													c[z + (o + 8) >> 2] = b;
													c[z + (o + 12) >> 2] = R;
													c[z + (o + 24) >> 2] = 0;
													break
												} else la()
											} else {
												w = (c[4790] | 0) + a | 0;
												c[4790] = w;
												c[4793] = m;
												c[z + (o + 4) >> 2] = w | 1
											}
										while (0);
										g = z + (n | 8) | 0;
										break d
									} else i = 19596;
								while (1) {
									h = c[i >> 2] | 0;
									if (h >>> 0 <= p >>> 0 ? (H = c[i + 4 >> 2] | 0, I = h + H | 0, I >>> 0 > p >>> 0) : 0) break;
									i = c[i + 8 >> 2] | 0
								}
								i = h + (H + -39) | 0;
								i = h + (H + -47 + ((i & 7 | 0) == 0 ? 0 : 0 - i & 7)) | 0;
								j = p + 16 | 0;
								i = i >>> 0 < j >>> 0 ? p : i;
								h = i + 8 | 0;
								g = z + 8 | 0;
								g = (g & 7 | 0) == 0 ? 0 : 0 - g & 7;
								w = q + -40 - g | 0;
								c[4793] = z + g;
								c[4790] = w;
								c[z + (g + 4) >> 2] = w | 1;
								c[z + (q + -36) >> 2] = 40;
								c[4794] = c[4909];
								g = i + 4 | 0;
								c[g >> 2] = 27;
								c[h >> 2] = c[4899];
								c[h + 4 >> 2] = c[4900];
								c[h + 8 >> 2] = c[4901];
								c[h + 12 >> 2] = c[4902];
								c[4899] = z;
								c[4900] = q;
								c[4902] = 0;
								c[4901] = h;
								h = i + 28 | 0;
								c[h >> 2] = 7;
								if ((i + 32 | 0) >>> 0 < I >>> 0)
									do {
										w = h;
										h = h + 4 | 0;
										c[h >> 2] = 7
									} while ((w + 8 | 0) >>> 0 < I >>> 0);
								if ((i | 0) != (p | 0)) {
									a = i - p | 0;
									c[g >> 2] = c[g >> 2] & -2;
									c[p + 4 >> 2] = a | 1;
									c[i >> 2] = a;
									f = a >>> 3;
									if (a >>> 0 < 256) {
										h = f << 1;
										i = 19188 + (h << 2) | 0;
										g = c[4787] | 0;
										e = 1 << f;
										if (g & e) {
											d = 19188 + (h + 2 << 2) | 0;
											b = c[d >> 2] | 0;
											if (b >>> 0 < (c[4791] | 0) >>> 0) la();
											else {
												L = d;
												M = b
											}
										} else {
											c[4787] = g | e;
											L = 19188 + (h + 2 << 2) | 0;
											M = i
										}
										c[L >> 2] = p;
										c[M + 12 >> 2] = p;
										c[p + 8 >> 2] = M;
										c[p + 12 >> 2] = i;
										break
									}
									d = a >>> 8;
									if (d)
										if (a >>> 0 > 16777215) h = 31;
										else {
											v = (d + 1048320 | 0) >>> 16 & 8;
											w = d << v;
											u = (w + 520192 | 0) >>> 16 & 4;
											w = w << u;
											h = (w + 245760 | 0) >>> 16 & 2;
											h = 14 - (u | v | h) + (w << h >>> 15) | 0;
											h = a >>> (h + 7 | 0) & 1 | h << 1
										}
									else h = 0;
									e = 19452 + (h << 2) | 0;
									c[p + 28 >> 2] = h;
									c[p + 20 >> 2] = 0;
									c[j >> 2] = 0;
									d = c[4788] | 0;
									b = 1 << h;
									if (!(d & b)) {
										c[4788] = d | b;
										c[e >> 2] = p;
										c[p + 24 >> 2] = e;
										c[p + 12 >> 2] = p;
										c[p + 8 >> 2] = p;
										break
									}
									d = c[e >> 2] | 0;
									m: do
										if ((c[d + 4 >> 2] & -8 | 0) != (a | 0)) {
											h = a << ((h | 0) == 31 ? 0 : 25 - (h >>> 1) | 0);
											while (1) {
												e = d + 16 + (h >>> 31 << 2) | 0;
												b = c[e >> 2] | 0;
												if (!b) break;
												if ((c[b + 4 >> 2] & -8 | 0) == (a | 0)) {
													N = b;
													break m
												} else {
													h = h << 1;
													d = b
												}
											}
											if (e >>> 0 < (c[4791] | 0) >>> 0) la();
											else {
												c[e >> 2] = p;
												c[p + 24 >> 2] = d;
												c[p + 12 >> 2] = p;
												c[p + 8 >> 2] = p;
												break h
											}
										} else N = d;
									while (0);
									d = N + 8 | 0;
									b = c[d >> 2] | 0;
									w = c[4791] | 0;
									if (b >>> 0 >= w >>> 0 & N >>> 0 >= w >>> 0) {
										c[b + 12 >> 2] = p;
										c[d >> 2] = p;
										c[p + 8 >> 2] = b;
										c[p + 12 >> 2] = N;
										c[p + 24 >> 2] = 0;
										break
									} else la()
								}
							} else {
								w = c[4791] | 0;
								if ((w | 0) == 0 | z >>> 0 < w >>> 0) c[4791] = z;
								c[4899] = z;
								c[4900] = q;
								c[4902] = 0;
								c[4796] = c[4905];
								c[4795] = -1;
								d = 0;
								do {
									w = d << 1;
									v = 19188 + (w << 2) | 0;
									c[19188 + (w + 3 << 2) >> 2] = v;
									c[19188 + (w + 2 << 2) >> 2] = v;
									d = d + 1 | 0
								} while ((d | 0) != 32);
								w = z + 8 | 0;
								w = (w & 7 | 0) == 0 ? 0 : 0 - w & 7;
								v = q + -40 - w | 0;
								c[4793] = z + w;
								c[4790] = v;
								c[z + (w + 4) >> 2] = v | 1;
								c[z + (q + -36) >> 2] = 40;
								c[4794] = c[4909]
							}
						while (0);
						b = c[4790] | 0;
						if (b >>> 0 > A >>> 0) {
							w = b - A | 0;
							c[4790] = w;
							g = c[4793] | 0;
							c[4793] = g + A;
							c[g + (A + 4) >> 2] = w | 1;
							c[g + 4 >> 2] = A | 3;
							g = g + 8 | 0;
							break
						}
					}
					if (!(c[4776] | 0)) b = 19644;
					else b = c[(ka() | 0) + 60 >> 2] | 0;
					c[b >> 2] = 12;
					g = 0
				} else g = 0
			}
		while (0);
		return g | 0
	}

	function lc(a) {
		a = a | 0;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0;
		a: do
			if (a) {
				f = a + -8 | 0;
				k = c[4791] | 0;
				b: do
					if (f >>> 0 >= k >>> 0 ? (e = c[a + -4 >> 2] | 0, d = e & 3, (d | 0) != 1) : 0) {
						v = e & -8;
						w = a + (v + -8) | 0;
						do
							if (!(e & 1)) {
								f = c[f >> 2] | 0;
								if (!d) break a;
								l = -8 - f | 0;
								n = a + l | 0;
								o = f + v | 0;
								if (n >>> 0 < k >>> 0) break b;
								if ((n | 0) == (c[4792] | 0)) {
									g = a + (v + -4) | 0;
									f = c[g >> 2] | 0;
									if ((f & 3 | 0) != 3) {
										B = n;
										g = o;
										break
									}
									c[4789] = o;
									c[g >> 2] = f & -2;
									c[a + (l + 4) >> 2] = o | 1;
									c[w >> 2] = o;
									break a
								}
								d = f >>> 3;
								if (f >>> 0 < 256) {
									e = c[a + (l + 8) >> 2] | 0;
									g = c[a + (l + 12) >> 2] | 0;
									f = 19188 + (d << 1 << 2) | 0;
									do
										if ((e | 0) != (f | 0)) {
											if (e >>> 0 >= k >>> 0 ? (c[e + 12 >> 2] | 0) == (n | 0) : 0) break;
											la()
										}
									while (0);
									if ((g | 0) == (e | 0)) {
										c[4787] = c[4787] & ~(1 << d);
										B = n;
										g = o;
										break
									}
									do
										if ((g | 0) == (f | 0)) b = g + 8 | 0;
										else {
											if (g >>> 0 >= k >>> 0 ? (h = g + 8 | 0, (c[h >> 2] | 0) == (n | 0)) : 0) {
												b = h;
												break
											}
											la()
										}
									while (0);
									c[e + 12 >> 2] = g;
									c[b >> 2] = e;
									B = n;
									g = o;
									break
								}
								h = c[a + (l + 24) >> 2] | 0;
								f = c[a + (l + 12) >> 2] | 0;
								do
									if ((f | 0) == (n | 0)) {
										e = a + (l + 20) | 0;
										f = c[e >> 2] | 0;
										if (!f) {
											e = a + (l + 16) | 0;
											f = c[e >> 2] | 0;
											if (!f) {
												m = 0;
												break
											}
										}
										while (1) {
											d = f + 20 | 0;
											b = c[d >> 2] | 0;
											if (b) {
												f = b;
												e = d;
												continue
											}
											d = f + 16 | 0;
											b = c[d >> 2] | 0;
											if (!b) break;
											else {
												f = b;
												e = d
											}
										}
										if (e >>> 0 < k >>> 0) la();
										else {
											c[e >> 2] = 0;
											m = f;
											break
										}
									} else {
										e = c[a + (l + 8) >> 2] | 0;
										if ((e >>> 0 >= k >>> 0 ? (i = e + 12 | 0, (c[i >> 2] | 0) == (n | 0)) : 0) ? (j = f + 8 | 0, (c[j >> 2] | 0) == (n | 0)) : 0) {
											c[i >> 2] = f;
											c[j >> 2] = e;
											m = f;
											break
										}
										la()
									}
								while (0);
								if (h) {
									f = c[a + (l + 28) >> 2] | 0;
									e = 19452 + (f << 2) | 0;
									if ((n | 0) == (c[e >> 2] | 0)) {
										c[e >> 2] = m;
										if (!m) {
											c[4788] = c[4788] & ~(1 << f);
											B = n;
											g = o;
											break
										}
									} else {
										if (h >>> 0 < (c[4791] | 0) >>> 0) la();
										f = h + 16 | 0;
										if ((c[f >> 2] | 0) == (n | 0)) c[f >> 2] = m;
										else c[h + 20 >> 2] = m;
										if (!m) {
											B = n;
											g = o;
											break
										}
									}
									e = c[4791] | 0;
									if (m >>> 0 < e >>> 0) la();
									c[m + 24 >> 2] = h;
									f = c[a + (l + 16) >> 2] | 0;
									do
										if (f)
											if (f >>> 0 < e >>> 0) la();
											else {
												c[m + 16 >> 2] = f;
												c[f + 24 >> 2] = m;
												break
											}
									while (0);
									f = c[a + (l + 20) >> 2] | 0;
									if (f)
										if (f >>> 0 < (c[4791] | 0) >>> 0) la();
										else {
											c[m + 20 >> 2] = f;
											c[f + 24 >> 2] = m;
											B = n;
											g = o;
											break
										}
									else {
										B = n;
										g = o
									}
								} else {
									B = n;
									g = o
								}
							} else {
								B = f;
								g = v
							}
						while (0);
						if (B >>> 0 < w >>> 0 ? (p = a + (v + -4) | 0, q = c[p >> 2] | 0, (q & 1 | 0) != 0) : 0) {
							if (!(q & 2)) {
								if ((w | 0) == (c[4793] | 0)) {
									x = (c[4790] | 0) + g | 0;
									c[4790] = x;
									c[4793] = B;
									c[B + 4 >> 2] = x | 1;
									if ((B | 0) != (c[4792] | 0)) break a;
									c[4792] = 0;
									c[4789] = 0;
									break a
								}
								if ((w | 0) == (c[4792] | 0)) {
									x = (c[4789] | 0) + g | 0;
									c[4789] = x;
									c[4792] = B;
									c[B + 4 >> 2] = x | 1;
									c[B + x >> 2] = x;
									break a
								}
								j = (q & -8) + g | 0;
								d = q >>> 3;
								do
									if (q >>> 0 >= 256) {
										b = c[a + (v + 16) >> 2] | 0;
										g = c[a + (v | 4) >> 2] | 0;
										do
											if ((g | 0) == (w | 0)) {
												f = a + (v + 12) | 0;
												g = c[f >> 2] | 0;
												if (!g) {
													f = a + (v + 8) | 0;
													g = c[f >> 2] | 0;
													if (!g) {
														x = 0;
														break
													}
												}
												while (1) {
													e = g + 20 | 0;
													d = c[e >> 2] | 0;
													if (d) {
														g = d;
														f = e;
														continue
													}
													e = g + 16 | 0;
													d = c[e >> 2] | 0;
													if (!d) break;
													else {
														g = d;
														f = e
													}
												}
												if (f >>> 0 < (c[4791] | 0) >>> 0) la();
												else {
													c[f >> 2] = 0;
													x = g;
													break
												}
											} else {
												f = c[a + v >> 2] | 0;
												if ((f >>> 0 >= (c[4791] | 0) >>> 0 ? (t = f + 12 | 0, (c[t >> 2] | 0) == (w | 0)) : 0) ? (u = g + 8 | 0, (c[u >> 2] | 0) == (w | 0)) : 0) {
													c[t >> 2] = g;
													c[u >> 2] = f;
													x = g;
													break
												}
												la()
											}
										while (0);
										if (b) {
											g = c[a + (v + 20) >> 2] | 0;
											f = 19452 + (g << 2) | 0;
											if ((w | 0) == (c[f >> 2] | 0)) {
												c[f >> 2] = x;
												if (!x) {
													c[4788] = c[4788] & ~(1 << g);
													break
												}
											} else {
												if (b >>> 0 < (c[4791] | 0) >>> 0) la();
												g = b + 16 | 0;
												if ((c[g >> 2] | 0) == (w | 0)) c[g >> 2] = x;
												else c[b + 20 >> 2] = x;
												if (!x) break
											}
											g = c[4791] | 0;
											if (x >>> 0 < g >>> 0) la();
											c[x + 24 >> 2] = b;
											f = c[a + (v + 8) >> 2] | 0;
											do
												if (f)
													if (f >>> 0 < g >>> 0) la();
													else {
														c[x + 16 >> 2] = f;
														c[f + 24 >> 2] = x;
														break
													}
											while (0);
											d = c[a + (v + 12) >> 2] | 0;
											if (d)
												if (d >>> 0 < (c[4791] | 0) >>> 0) la();
												else {
													c[x + 20 >> 2] = d;
													c[d + 24 >> 2] = x;
													break
												}
										}
									} else {
										e = c[a + v >> 2] | 0;
										g = c[a + (v | 4) >> 2] | 0;
										f = 19188 + (d << 1 << 2) | 0;
										do
											if ((e | 0) != (f | 0)) {
												if (e >>> 0 >= (c[4791] | 0) >>> 0 ? (c[e + 12 >> 2] | 0) == (w | 0) : 0) break;
												la()
											}
										while (0);
										if ((g | 0) == (e | 0)) {
											c[4787] = c[4787] & ~(1 << d);
											break
										}
										do
											if ((g | 0) == (f | 0)) r = g + 8 | 0;
											else {
												if (g >>> 0 >= (c[4791] | 0) >>> 0 ? (s = g + 8 | 0, (c[s >> 2] | 0) == (w | 0)) : 0) {
													r = s;
													break
												}
												la()
											}
										while (0);
										c[e + 12 >> 2] = g;
										c[r >> 2] = e
									}
								while (0);
								c[B + 4 >> 2] = j | 1;
								c[B + j >> 2] = j;
								if ((B | 0) == (c[4792] | 0)) {
									c[4789] = j;
									break a
								} else g = j
							} else {
								c[p >> 2] = q & -2;
								c[B + 4 >> 2] = g | 1;
								c[B + g >> 2] = g
							}
							f = g >>> 3;
							if (g >>> 0 < 256) {
								e = f << 1;
								g = 19188 + (e << 2) | 0;
								b = c[4787] | 0;
								d = 1 << f;
								if (b & d) {
									d = 19188 + (e + 2 << 2) | 0;
									b = c[d >> 2] | 0;
									if (b >>> 0 < (c[4791] | 0) >>> 0) la();
									else {
										y = d;
										z = b
									}
								} else {
									c[4787] = b | d;
									y = 19188 + (e + 2 << 2) | 0;
									z = g
								}
								c[y >> 2] = B;
								c[z + 12 >> 2] = B;
								c[B + 8 >> 2] = z;
								c[B + 12 >> 2] = g;
								break a
							}
							b = g >>> 8;
							if (b)
								if (g >>> 0 > 16777215) f = 31;
								else {
									w = (b + 1048320 | 0) >>> 16 & 8;
									x = b << w;
									v = (x + 520192 | 0) >>> 16 & 4;
									x = x << v;
									f = (x + 245760 | 0) >>> 16 & 2;
									f = 14 - (v | w | f) + (x << f >>> 15) | 0;
									f = g >>> (f + 7 | 0) & 1 | f << 1
								}
							else f = 0;
							d = 19452 + (f << 2) | 0;
							c[B + 28 >> 2] = f;
							c[B + 20 >> 2] = 0;
							c[B + 16 >> 2] = 0;
							b = c[4788] | 0;
							e = 1 << f;
							c: do
								if (b & e) {
									d = c[d >> 2] | 0;
									d: do
										if ((c[d + 4 >> 2] & -8 | 0) != (g | 0)) {
											f = g << ((f | 0) == 31 ? 0 : 25 - (f >>> 1) | 0);
											while (1) {
												b = d + 16 + (f >>> 31 << 2) | 0;
												e = c[b >> 2] | 0;
												if (!e) break;
												if ((c[e + 4 >> 2] & -8 | 0) == (g | 0)) {
													A = e;
													break d
												} else {
													f = f << 1;
													d = e
												}
											}
											if (b >>> 0 < (c[4791] | 0) >>> 0) la();
											else {
												c[b >> 2] = B;
												c[B + 24 >> 2] = d;
												c[B + 12 >> 2] = B;
												c[B + 8 >> 2] = B;
												break c
											}
										} else A = d;
									while (0);
									b = A + 8 | 0;
									d = c[b >> 2] | 0;
									x = c[4791] | 0;
									if (d >>> 0 >= x >>> 0 & A >>> 0 >= x >>> 0) {
										c[d + 12 >> 2] = B;
										c[b >> 2] = B;
										c[B + 8 >> 2] = d;
										c[B + 12 >> 2] = A;
										c[B + 24 >> 2] = 0;
										break
									} else la()
								} else {
									c[4788] = b | e;
									c[d >> 2] = B;
									c[B + 24 >> 2] = d;
									c[B + 12 >> 2] = B;
									c[B + 8 >> 2] = B
								}
							while (0);
							x = (c[4795] | 0) + -1 | 0;
							c[4795] = x;
							if (!x) b = 19604;
							else break a;
							while (1) {
								b = c[b >> 2] | 0;
								if (!b) break;
								else b = b + 8 | 0
							}
							c[4795] = -1;
							break a
						}
					}
				while (0);
				la()
			}
		while (0);
		return
	}

	function mc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		a: do
			if (!a) d = kc(b) | 0;
			else {
				if (b >>> 0 > 4294967231) {
					if (!(c[4776] | 0)) d = 19644;
					else d = c[(ka() | 0) + 60 >> 2] | 0;
					c[d >> 2] = 12;
					d = 0;
					break
				}
				q = b >>> 0 < 11 ? 16 : b + 11 & -8;
				s = a + -4 | 0;
				r = c[s >> 2] | 0;
				m = r & -8;
				t = m + -8 | 0;
				n = a + t | 0;
				l = c[4791] | 0;
				g = r & 3;
				if ((g | 0) != 1 & (a + -8 | 0) >>> 0 >= l >>> 0 & (t | 0) > -8 ? (h = m | 4, f = a + (h + -8) | 0, e = c[f >> 2] | 0, (e & 1 | 0) != 0) : 0) {
					do
						if (!g) {
							if (!(q >>> 0 < 256 | m >>> 0 < (q | 4) >>> 0) ? (m - q | 0) >>> 0 <= c[4907] << 1 >>> 0 : 0) {
								d = a;
								break a
							}
						} else {
							if (m >>> 0 >= q >>> 0) {
								e = m - q | 0;
								if (e >>> 0 <= 15) {
									d = a;
									break a
								}
								c[s >> 2] = r & 1 | q | 2;
								c[a + ((q | 4) + -8) >> 2] = e | 3;
								c[f >> 2] = c[f >> 2] | 1;
								nc(a + (q + -8) | 0, e);
								d = a;
								break a
							}
							if ((n | 0) == (c[4793] | 0)) {
								e = (c[4790] | 0) + m | 0;
								if (e >>> 0 <= q >>> 0) break;
								d = e - q | 0;
								c[s >> 2] = r & 1 | q | 2;
								c[a + ((q | 4) + -8) >> 2] = d | 1;
								c[4793] = a + (q + -8);
								c[4790] = d;
								d = a;
								break a
							}
							if ((n | 0) == (c[4792] | 0)) {
								e = (c[4789] | 0) + m | 0;
								if (e >>> 0 < q >>> 0) break;
								d = e - q | 0;
								if (d >>> 0 > 15) {
									c[s >> 2] = r & 1 | q | 2;
									c[a + ((q | 4) + -8) >> 2] = d | 1;
									c[a + (e + -8) >> 2] = d;
									e = a + (e + -4) | 0;
									c[e >> 2] = c[e >> 2] & -2;
									e = a + (q + -8) | 0
								} else {
									c[s >> 2] = r & 1 | e | 2;
									e = a + (e + -4) | 0;
									c[e >> 2] = c[e >> 2] | 1;
									e = 0;
									d = 0
								}
								c[4789] = d;
								c[4792] = e;
								d = a;
								break a
							}
							if ((e & 2 | 0) == 0 ? (p = (e & -8) + m | 0, p >>> 0 >= q >>> 0) : 0) {
								b = p - q | 0;
								f = e >>> 3;
								do
									if (e >>> 0 >= 256) {
										j = c[a + (m + 16) >> 2] | 0;
										d = c[a + h >> 2] | 0;
										b: do
											if ((d | 0) == (n | 0)) {
												d = a + (m + 12) | 0;
												e = c[d >> 2] | 0;
												if (!e) {
													d = a + (m + 8) | 0;
													e = c[d >> 2] | 0;
													if (!e) {
														o = 0;
														break
													}
												}
												while (1) {
													f = e + 20 | 0;
													g = c[f >> 2] | 0;
													if (g) {
														e = g;
														d = f;
														continue
													}
													g = e + 16 | 0;
													f = c[g >> 2] | 0;
													if (!f) break;
													else {
														e = f;
														d = g
													}
												}
												if (d >>> 0 < l >>> 0) la();
												else {
													c[d >> 2] = 0;
													o = e;
													break
												}
											} else {
												f = c[a + m >> 2] | 0;
												do
													if (f >>> 0 >= l >>> 0 ? (k = f + 12 | 0, (c[k >> 2] | 0) == (n | 0)) : 0) {
														e = d + 8 | 0;
														if ((c[e >> 2] | 0) != (n | 0)) break;
														c[k >> 2] = d;
														c[e >> 2] = f;
														o = d;
														break b
													}
												while (0);
												la()
											}
										while (0);
										if (j) {
											e = c[a + (m + 20) >> 2] | 0;
											d = 19452 + (e << 2) | 0;
											if ((n | 0) == (c[d >> 2] | 0)) {
												c[d >> 2] = o;
												if (!o) {
													c[4788] = c[4788] & ~(1 << e);
													break
												}
											} else {
												if (j >>> 0 < (c[4791] | 0) >>> 0) la();
												e = j + 16 | 0;
												if ((c[e >> 2] | 0) == (n | 0)) c[e >> 2] = o;
												else c[j + 20 >> 2] = o;
												if (!o) break
											}
											d = c[4791] | 0;
											if (o >>> 0 < d >>> 0) la();
											c[o + 24 >> 2] = j;
											e = c[a + (m + 8) >> 2] | 0;
											do
												if (e)
													if (e >>> 0 < d >>> 0) la();
													else {
														c[o + 16 >> 2] = e;
														c[e + 24 >> 2] = o;
														break
													}
											while (0);
											e = c[a + (m + 12) >> 2] | 0;
											if (!e) break;
											if (e >>> 0 < (c[4791] | 0) >>> 0) la();
											else {
												c[o + 20 >> 2] = e;
												c[e + 24 >> 2] = o;
												break
											}
										}
									} else {
										g = c[a + m >> 2] | 0;
										e = c[a + h >> 2] | 0;
										d = 19188 + (f << 1 << 2) | 0;
										do
											if ((g | 0) != (d | 0)) {
												if (g >>> 0 >= l >>> 0 ? (c[g + 12 >> 2] | 0) == (n | 0) : 0) break;
												la()
											}
										while (0);
										if ((e | 0) == (g | 0)) {
											c[4787] = c[4787] & ~(1 << f);
											break
										}
										do
											if ((e | 0) == (d | 0)) i = e + 8 | 0;
											else {
												if (e >>> 0 >= l >>> 0 ? (j = e + 8 | 0, (c[j >> 2] | 0) == (n | 0)) : 0) {
													i = j;
													break
												}
												la()
											}
										while (0);
										c[g + 12 >> 2] = e;
										c[i >> 2] = g
									}
								while (0);
								if (b >>> 0 < 16) {
									c[s >> 2] = p | r & 1 | 2;
									d = a + ((p | 4) + -8) | 0;
									c[d >> 2] = c[d >> 2] | 1;
									d = a;
									break a
								} else {
									c[s >> 2] = r & 1 | q | 2;
									c[a + ((q | 4) + -8) >> 2] = b | 3;
									d = a + ((p | 4) + -8) | 0;
									c[d >> 2] = c[d >> 2] | 1;
									nc(a + (q + -8) | 0, b);
									d = a;
									break a
								}
							}
						}
					while (0);
					d = kc(b) | 0;
					if (!d) {
						d = 0;
						break
					}
					l = c[s >> 2] | 0;
					l = (l & -8) - ((l & 3 | 0) == 0 ? 8 : 4) | 0;
					tc(d | 0, a | 0, (l >>> 0 < b >>> 0 ? l : b) | 0) | 0;
					lc(a);
					break
				}
				la()
			}
		while (0);
		return d | 0
	}

	function nc(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0;
		u = a + b | 0;
		h = c[a + 4 >> 2] | 0;
		do
			if (!(h & 1)) {
				m = c[a >> 2] | 0;
				if (h & 3) {
					o = a + (0 - m) | 0;
					h = m + b | 0;
					l = c[4791] | 0;
					if (o >>> 0 < l >>> 0) la();
					if ((o | 0) == (c[4792] | 0)) {
						f = a + (b + 4) | 0;
						g = c[f >> 2] | 0;
						if ((g & 3 | 0) != 3) {
							p = 54;
							break
						}
						c[4789] = h;
						c[f >> 2] = g & -2;
						c[a + (4 - m) >> 2] = h | 1;
						c[u >> 2] = h;
						break
					}
					d = m >>> 3;
					if (m >>> 0 < 256) {
						e = c[a + (8 - m) >> 2] | 0;
						g = c[a + (12 - m) >> 2] | 0;
						f = 19188 + (d << 1 << 2) | 0;
						do
							if ((e | 0) != (f | 0)) {
								if (e >>> 0 >= l >>> 0 ? (c[e + 12 >> 2] | 0) == (o | 0) : 0) break;
								la()
							}
						while (0);
						if ((g | 0) == (e | 0)) {
							c[4787] = c[4787] & ~(1 << d);
							p = 54;
							break
						}
						do
							if ((g | 0) == (f | 0)) i = g + 8 | 0;
							else {
								if (g >>> 0 >= l >>> 0 ? (j = g + 8 | 0, (c[j >> 2] | 0) == (o | 0)) : 0) {
									i = j;
									break
								}
								la()
							}
						while (0);
						c[e + 12 >> 2] = g;
						c[i >> 2] = e;
						p = 54;
						break
					}
					j = c[a + (24 - m) >> 2] | 0;
					g = c[a + (12 - m) >> 2] | 0;
					do
						if ((g | 0) == (o | 0)) {
							f = 16 - m | 0;
							e = a + (f + 4) | 0;
							g = c[e >> 2] | 0;
							if (!g) {
								f = a + f | 0;
								g = c[f >> 2] | 0;
								if (!g) {
									n = 0;
									break
								}
							} else f = e;
							while (1) {
								e = g + 20 | 0;
								d = c[e >> 2] | 0;
								if (d) {
									g = d;
									f = e;
									continue
								}
								e = g + 16 | 0;
								d = c[e >> 2] | 0;
								if (!d) break;
								else {
									g = d;
									f = e
								}
							}
							if (f >>> 0 < l >>> 0) la();
							else {
								c[f >> 2] = 0;
								n = g;
								break
							}
						} else {
							f = c[a + (8 - m) >> 2] | 0;
							if ((f >>> 0 >= l >>> 0 ? (e = f + 12 | 0, (c[e >> 2] | 0) == (o | 0)) : 0) ? (k = g + 8 | 0, (c[k >> 2] | 0) == (o | 0)) : 0) {
								c[e >> 2] = g;
								c[k >> 2] = f;
								n = g;
								break
							}
							la()
						}
					while (0);
					if (j) {
						g = c[a + (28 - m) >> 2] | 0;
						f = 19452 + (g << 2) | 0;
						if ((o | 0) == (c[f >> 2] | 0)) {
							c[f >> 2] = n;
							if (!n) {
								c[4788] = c[4788] & ~(1 << g);
								p = 54;
								break
							}
						} else {
							if (j >>> 0 < (c[4791] | 0) >>> 0) la();
							g = j + 16 | 0;
							if ((c[g >> 2] | 0) == (o | 0)) c[g >> 2] = n;
							else c[j + 20 >> 2] = n;
							if (!n) {
								p = 54;
								break
							}
						}
						e = c[4791] | 0;
						if (n >>> 0 < e >>> 0) la();
						c[n + 24 >> 2] = j;
						g = 16 - m | 0;
						f = c[a + g >> 2] | 0;
						do
							if (f)
								if (f >>> 0 < e >>> 0) la();
								else {
									c[n + 16 >> 2] = f;
									c[f + 24 >> 2] = n;
									break
								}
						while (0);
						g = c[a + (g + 4) >> 2] | 0;
						if (g)
							if (g >>> 0 < (c[4791] | 0) >>> 0) la();
							else {
								c[n + 20 >> 2] = g;
								c[g + 24 >> 2] = n;
								p = 54;
								break
							}
						else p = 54
					} else p = 54
				}
			} else {
				o = a;
				h = b;
				p = 54
			}
		while (0);
		a: do
			if ((p | 0) == 54) {
				j = c[4791] | 0;
				if (u >>> 0 < j >>> 0) la();
				g = a + (b + 4) | 0;
				f = c[g >> 2] | 0;
				if (!(f & 2)) {
					if ((u | 0) == (c[4793] | 0)) {
						w = (c[4790] | 0) + h | 0;
						c[4790] = w;
						c[4793] = o;
						c[o + 4 >> 2] = w | 1;
						if ((o | 0) != (c[4792] | 0)) break;
						c[4792] = 0;
						c[4789] = 0;
						break
					}
					if ((u | 0) == (c[4792] | 0)) {
						w = (c[4789] | 0) + h | 0;
						c[4789] = w;
						c[4792] = o;
						c[o + 4 >> 2] = w | 1;
						c[o + w >> 2] = w;
						break
					}
					i = (f & -8) + h | 0;
					e = f >>> 3;
					do
						if (f >>> 0 >= 256) {
							k = c[a + (b + 24) >> 2] | 0;
							h = c[a + (b + 12) >> 2] | 0;
							do
								if ((h | 0) == (u | 0)) {
									g = a + (b + 20) | 0;
									h = c[g >> 2] | 0;
									if (!h) {
										g = a + (b + 16) | 0;
										h = c[g >> 2] | 0;
										if (!h) {
											v = 0;
											break
										}
									}
									while (1) {
										f = h + 20 | 0;
										e = c[f >> 2] | 0;
										if (e) {
											h = e;
											g = f;
											continue
										}
										f = h + 16 | 0;
										e = c[f >> 2] | 0;
										if (!e) break;
										else {
											h = e;
											g = f
										}
									}
									if (g >>> 0 < j >>> 0) la();
									else {
										c[g >> 2] = 0;
										v = h;
										break
									}
								} else {
									g = c[a + (b + 8) >> 2] | 0;
									if ((g >>> 0 >= j >>> 0 ? (s = g + 12 | 0, (c[s >> 2] | 0) == (u | 0)) : 0) ? (t = h + 8 | 0, (c[t >> 2] | 0) == (u | 0)) : 0) {
										c[s >> 2] = h;
										c[t >> 2] = g;
										v = h;
										break
									}
									la()
								}
							while (0);
							if (k) {
								h = c[a + (b + 28) >> 2] | 0;
								g = 19452 + (h << 2) | 0;
								if ((u | 0) == (c[g >> 2] | 0)) {
									c[g >> 2] = v;
									if (!v) {
										c[4788] = c[4788] & ~(1 << h);
										break
									}
								} else {
									if (k >>> 0 < (c[4791] | 0) >>> 0) la();
									h = k + 16 | 0;
									if ((c[h >> 2] | 0) == (u | 0)) c[h >> 2] = v;
									else c[k + 20 >> 2] = v;
									if (!v) break
								}
								h = c[4791] | 0;
								if (v >>> 0 < h >>> 0) la();
								c[v + 24 >> 2] = k;
								g = c[a + (b + 16) >> 2] | 0;
								do
									if (g)
										if (g >>> 0 < h >>> 0) la();
										else {
											c[v + 16 >> 2] = g;
											c[g + 24 >> 2] = v;
											break
										}
								while (0);
								e = c[a + (b + 20) >> 2] | 0;
								if (e)
									if (e >>> 0 < (c[4791] | 0) >>> 0) la();
									else {
										c[v + 20 >> 2] = e;
										c[e + 24 >> 2] = v;
										break
									}
							}
						} else {
							f = c[a + (b + 8) >> 2] | 0;
							h = c[a + (b + 12) >> 2] | 0;
							g = 19188 + (e << 1 << 2) | 0;
							do
								if ((f | 0) != (g | 0)) {
									if (f >>> 0 >= j >>> 0 ? (c[f + 12 >> 2] | 0) == (u | 0) : 0) break;
									la()
								}
							while (0);
							if ((h | 0) == (f | 0)) {
								c[4787] = c[4787] & ~(1 << e);
								break
							}
							do
								if ((h | 0) == (g | 0)) q = h + 8 | 0;
								else {
									if (h >>> 0 >= j >>> 0 ? (r = h + 8 | 0, (c[r >> 2] | 0) == (u | 0)) : 0) {
										q = r;
										break
									}
									la()
								}
							while (0);
							c[f + 12 >> 2] = h;
							c[q >> 2] = f
						}
					while (0);
					c[o + 4 >> 2] = i | 1;
					c[o + i >> 2] = i;
					if ((o | 0) == (c[4792] | 0)) {
						c[4789] = i;
						break
					} else h = i
				} else {
					c[g >> 2] = f & -2;
					c[o + 4 >> 2] = h | 1;
					c[o + h >> 2] = h
				}
				g = h >>> 3;
				if (h >>> 0 < 256) {
					f = g << 1;
					h = 19188 + (f << 2) | 0;
					d = c[4787] | 0;
					e = 1 << g;
					if (d & e) {
						e = 19188 + (f + 2 << 2) | 0;
						d = c[e >> 2] | 0;
						if (d >>> 0 < (c[4791] | 0) >>> 0) la();
						else {
							w = e;
							x = d
						}
					} else {
						c[4787] = d | e;
						w = 19188 + (f + 2 << 2) | 0;
						x = h
					}
					c[w >> 2] = o;
					c[x + 12 >> 2] = o;
					c[o + 8 >> 2] = x;
					c[o + 12 >> 2] = h;
					break
				}
				d = h >>> 8;
				if (d)
					if (h >>> 0 > 16777215) g = 31;
					else {
						b = (d + 1048320 | 0) >>> 16 & 8;
						w = d << b;
						a = (w + 520192 | 0) >>> 16 & 4;
						w = w << a;
						g = (w + 245760 | 0) >>> 16 & 2;
						g = 14 - (a | b | g) + (w << g >>> 15) | 0;
						g = h >>> (g + 7 | 0) & 1 | g << 1
					}
				else g = 0;
				e = 19452 + (g << 2) | 0;
				c[o + 28 >> 2] = g;
				c[o + 20 >> 2] = 0;
				c[o + 16 >> 2] = 0;
				d = c[4788] | 0;
				f = 1 << g;
				if (!(d & f)) {
					c[4788] = d | f;
					c[e >> 2] = o;
					c[o + 24 >> 2] = e;
					c[o + 12 >> 2] = o;
					c[o + 8 >> 2] = o;
					break
				}
				e = c[e >> 2] | 0;
				b: do
					if ((c[e + 4 >> 2] & -8 | 0) != (h | 0)) {
						g = h << ((g | 0) == 31 ? 0 : 25 - (g >>> 1) | 0);
						while (1) {
							d = e + 16 + (g >>> 31 << 2) | 0;
							f = c[d >> 2] | 0;
							if (!f) break;
							if ((c[f + 4 >> 2] & -8 | 0) == (h | 0)) {
								y = f;
								break b
							} else {
								g = g << 1;
								e = f
							}
						}
						if (d >>> 0 < (c[4791] | 0) >>> 0) la();
						else {
							c[d >> 2] = o;
							c[o + 24 >> 2] = e;
							c[o + 12 >> 2] = o;
							c[o + 8 >> 2] = o;
							break a
						}
					} else y = e;
				while (0);
				d = y + 8 | 0;
				e = c[d >> 2] | 0;
				w = c[4791] | 0;
				if (e >>> 0 >= w >>> 0 & y >>> 0 >= w >>> 0) {
					c[e + 12 >> 2] = o;
					c[d >> 2] = o;
					c[o + 8 >> 2] = e;
					c[o + 12 >> 2] = y;
					c[o + 24 >> 2] = 0;
					break
				} else la()
			}
		while (0);
		return
	}

	function oc() {}

	function pc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		if ((c | 0) < 32) {
			C = b >> c;
			return a >>> c | (b & (1 << c) - 1) << 32 - c
		}
		C = (b | 0) < 0 ? -1 : 0;
		return b >> c - 32 | 0
	}

	function qc(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0;
		f = b + e | 0;
		if ((e | 0) >= 20) {
			d = d & 255;
			h = b & 3;
			i = d | d << 8 | d << 16 | d << 24;
			g = f & ~3;
			if (h) {
				h = b + 4 - h | 0;
				while ((b | 0) < (h | 0)) {
					a[b >> 0] = d;
					b = b + 1 | 0
				}
			}
			while ((b | 0) < (g | 0)) {
				c[b >> 2] = i;
				b = b + 4 | 0
			}
		}
		while ((b | 0) < (f | 0)) {
			a[b >> 0] = d;
			b = b + 1 | 0
		}
		return b - e | 0
	}

	function rc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		if ((c | 0) < 32) {
			C = b >>> c;
			return a >>> c | (b & (1 << c) - 1) << 32 - c
		}
		C = 0;
		return b >>> c - 32 | 0
	}

	function sc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		c = a + c >>> 0;
		return (C = b + d + (c >>> 0 < a >>> 0 | 0) >>> 0, c | 0) | 0
	}

	function tc(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0;
		if ((e | 0) >= 4096) return sa(b | 0, d | 0, e | 0) | 0;
		f = b | 0;
		if ((b & 3) == (d & 3)) {
			while (b & 3) {
				if (!e) return f | 0;
				a[b >> 0] = a[d >> 0] | 0;
				b = b + 1 | 0;
				d = d + 1 | 0;
				e = e - 1 | 0
			}
			while ((e | 0) >= 4) {
				c[b >> 2] = c[d >> 2];
				b = b + 4 | 0;
				d = d + 4 | 0;
				e = e - 4 | 0
			}
		}
		while ((e | 0) > 0) {
			a[b >> 0] = a[d >> 0] | 0;
			b = b + 1 | 0;
			d = d + 1 | 0;
			e = e - 1 | 0
		}
		return f | 0
	}

	function uc(b, c, d) {
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0;
		if ((c | 0) < (b | 0) & (b | 0) < (c + d | 0)) {
			e = b;
			c = c + d | 0;
			b = b + d | 0;
			while ((d | 0) > 0) {
				b = b - 1 | 0;
				c = c - 1 | 0;
				d = d - 1 | 0;
				a[b >> 0] = a[c >> 0] | 0
			}
			b = e
		} else tc(b, c, d) | 0;
		return b | 0
	}

	function vc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		b = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0;
		return (C = b, a - c >>> 0 | 0) | 0
	}

	function wc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		if ((c | 0) < 32) {
			C = b << c | (a & (1 << c) - 1 << 32 - c) >>> 32 - c;
			return a << c
		}
		C = a << c - 32;
		return 0
	}

	function xc(b) {
		b = b | 0;
		var c = 0;
		c = a[m + (b & 255) >> 0] | 0;
		if ((c | 0) < 8) return c | 0;
		c = a[m + (b >> 8 & 255) >> 0] | 0;
		if ((c | 0) < 8) return c + 8 | 0;
		c = a[m + (b >> 16 & 255) >> 0] | 0;
		if ((c | 0) < 8) return c + 16 | 0;
		return (a[m + (b >>> 24) >> 0] | 0) + 24 | 0
	}

	function yc(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0,
			d = 0,
			e = 0,
			f = 0;
		f = a & 65535;
		d = b & 65535;
		c = _(d, f) | 0;
		e = a >>> 16;
		d = (c >>> 16) + (_(d, e) | 0) | 0;
		b = b >>> 16;
		a = _(b, f) | 0;
		return (C = (d >>> 16) + (_(b, e) | 0) + (((d & 65535) + a | 0) >>> 16) | 0, d + a << 16 | c & 65535 | 0) | 0
	}

	function zc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0;
		j = b >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		i = ((b | 0) < 0 ? -1 : 0) >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		f = d >> 31 | ((d | 0) < 0 ? -1 : 0) << 1;
		e = ((d | 0) < 0 ? -1 : 0) >> 31 | ((d | 0) < 0 ? -1 : 0) << 1;
		h = vc(j ^ a, i ^ b, j, i) | 0;
		g = C;
		b = f ^ j;
		a = e ^ i;
		return vc((Ec(h, g, vc(f ^ c, e ^ d, f, e) | 0, C, 0) | 0) ^ b, C ^ a, b, a) | 0
	}

	function Ac(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		f = i;
		i = i + 16 | 0;
		j = f | 0;
		h = b >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		g = ((b | 0) < 0 ? -1 : 0) >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
		l = e >> 31 | ((e | 0) < 0 ? -1 : 0) << 1;
		k = ((e | 0) < 0 ? -1 : 0) >> 31 | ((e | 0) < 0 ? -1 : 0) << 1;
		b = vc(h ^ a, g ^ b, h, g) | 0;
		a = C;
		Ec(b, a, vc(l ^ d, k ^ e, l, k) | 0, C, j) | 0;
		a = vc(c[j >> 2] ^ h, c[j + 4 >> 2] ^ g, h, g) | 0;
		b = C;
		i = f;
		return (C = b, a) | 0
	}

	function Bc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = a;
		f = c;
		a = yc(e, f) | 0;
		c = C;
		return (C = (_(b, f) | 0) + (_(d, e) | 0) + c | c & 0, a | 0 | 0) | 0
	}

	function Cc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		return Ec(a, b, c, d, 0) | 0
	}

	function Dc(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0;
		g = i;
		i = i + 16 | 0;
		f = g | 0;
		Ec(a, b, d, e, f) | 0;
		i = g;
		return (C = c[f + 4 >> 2] | 0, c[f >> 2] | 0) | 0
	}

	function Ec(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		n = a;
		l = b;
		m = l;
		k = d;
		o = e;
		i = o;
		if (!m) {
			g = (f | 0) != 0;
			if (!i) {
				if (g) {
					c[f >> 2] = (n >>> 0) % (k >>> 0);
					c[f + 4 >> 2] = 0
				}
				l = 0;
				m = (n >>> 0) / (k >>> 0) >>> 0;
				return (C = l, m) | 0
			} else {
				if (!g) {
					l = 0;
					m = 0;
					return (C = l, m) | 0
				}
				c[f >> 2] = a | 0;
				c[f + 4 >> 2] = b & 0;
				l = 0;
				m = 0;
				return (C = l, m) | 0
			}
		}
		j = (i | 0) == 0;
		do
			if (k) {
				if (!j) {
					h = (aa(i | 0) | 0) - (aa(m | 0) | 0) | 0;
					if (h >>> 0 <= 31) {
						g = h + 1 | 0;
						l = 31 - h | 0;
						k = h - 31 >> 31;
						i = g;
						j = n >>> (g >>> 0) & k | m << l;
						k = m >>> (g >>> 0) & k;
						g = 0;
						h = n << l;
						break
					}
					if (!f) {
						l = 0;
						m = 0;
						return (C = l, m) | 0
					}
					c[f >> 2] = a | 0;
					c[f + 4 >> 2] = l | b & 0;
					l = 0;
					m = 0;
					return (C = l, m) | 0
				}
				j = k - 1 | 0;
				if (j & k) {
					h = (aa(k | 0) | 0) + 33 - (aa(m | 0) | 0) | 0;
					p = 64 - h | 0;
					l = 32 - h | 0;
					a = l >> 31;
					b = h - 32 | 0;
					k = b >> 31;
					i = h;
					j = l - 1 >> 31 & m >>> (b >>> 0) | (m << l | n >>> (h >>> 0)) & k;
					k = k & m >>> (h >>> 0);
					g = n << p & a;
					h = (m << p | n >>> (b >>> 0)) & a | n << l & h - 33 >> 31;
					break
				}
				if (f) {
					c[f >> 2] = j & n;
					c[f + 4 >> 2] = 0
				}
				if ((k | 0) == 1) {
					l = l | b & 0;
					m = a | 0 | 0;
					return (C = l, m) | 0
				} else {
					a = xc(k | 0) | 0;
					l = m >>> (a >>> 0) | 0;
					m = m << 32 - a | n >>> (a >>> 0) | 0;
					return (C = l, m) | 0
				}
			} else {
				if (j) {
					if (f) {
						c[f >> 2] = (m >>> 0) % (k >>> 0);
						c[f + 4 >> 2] = 0
					}
					l = 0;
					m = (m >>> 0) / (k >>> 0) >>> 0;
					return (C = l, m) | 0
				}
				if (!n) {
					if (f) {
						c[f >> 2] = 0;
						c[f + 4 >> 2] = (m >>> 0) % (i >>> 0)
					}
					l = 0;
					m = (m >>> 0) / (i >>> 0) >>> 0;
					return (C = l, m) | 0
				}
				j = i - 1 | 0;
				if (!(j & i)) {
					if (f) {
						c[f >> 2] = a | 0;
						c[f + 4 >> 2] = j & m | b & 0
					}
					l = 0;
					m = m >>> ((xc(i | 0) | 0) >>> 0);
					return (C = l, m) | 0
				}
				h = (aa(i | 0) | 0) - (aa(m | 0) | 0) | 0;
				if (h >>> 0 <= 30) {
					k = h + 1 | 0;
					h = 31 - h | 0;
					i = k;
					j = m << h | n >>> (k >>> 0);
					k = m >>> (k >>> 0);
					g = 0;
					h = n << h;
					break
				}
				if (!f) {
					l = 0;
					m = 0;
					return (C = l, m) | 0
				}
				c[f >> 2] = a | 0;
				c[f + 4 >> 2] = l | b & 0;
				l = 0;
				m = 0;
				return (C = l, m) | 0
			}
		while (0);
		if (!i) {
			l = h;
			i = 0;
			h = 0
		} else {
			m = d | 0 | 0;
			l = o | e & 0;
			b = sc(m | 0, l | 0, -1, -1) | 0;
			a = C;
			d = h;
			h = 0;
			do {
				p = d;
				d = g >>> 31 | d << 1;
				g = h | g << 1;
				p = j << 1 | p >>> 31 | 0;
				o = j >>> 31 | k << 1 | 0;
				vc(b, a, p, o) | 0;
				n = C;
				e = n >> 31 | ((n | 0) < 0 ? -1 : 0) << 1;
				h = e & 1;
				j = vc(p, o, e & m, (((n | 0) < 0 ? -1 : 0) >> 31 | ((n | 0) < 0 ? -1 : 0) << 1) & l) | 0;
				k = C;
				i = i - 1 | 0
			} while ((i | 0) != 0);
			l = d;
			i = 0
		}
		d = 0;
		if (f) {
			c[f >> 2] = j;
			c[f + 4 >> 2] = k
		}
		l = (g | 0) >>> 31 | (l | d) << 1 | (d << 1 | g >>> 31) & 0 | i;
		m = (g << 1 | 0 >>> 31) & -2 | h;
		return (C = l, m) | 0
	}

	function Fc(a, b, c, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		return ya[a & 7](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0) | 0
	}

	function Gc(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		ba(0);
		return 0
	}

	// EMSCRIPTEN_END_FUNCS
	var ya = [Gc, ec, gc, hc, ic, jc, Gc, Gc];
	return {
		_i64Add: sc,
		_speex_resampler_destroy: $b,
		_free: lc,
		_opus_decoder_create: Tb,
		_speex_resampler_init: _b,
		_memmove: uc,
		_opus_decode_float: Vb,
		_bitshift64Ashr: pc,
		_memset: qc,
		_speex_resampler_process_interleaved_float: bc,
		_malloc: kc,
		_opus_decoder_destroy: Xb,
		_memcpy: tc,
		_opus_decoder_ctl: Wb,
		_bitshift64Lshr: rc,
		runPostSets: oc,
		stackAlloc: za,
		stackSave: Aa,
		stackRestore: Ba,
		establishStackSpace: Ca,
		setThrew: Da,
		setTempRet0: Ga,
		getTempRet0: Ha,
		dynCall_iiiiiii: Fc
	}
})


// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var _speex_resampler_destroy = Module["_speex_resampler_destroy"] = asm["_speex_resampler_destroy"];
var _free = Module["_free"] = asm["_free"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _opus_decoder_create = Module["_opus_decoder_create"] = asm["_opus_decoder_create"];
var _opus_decoder_destroy = Module["_opus_decoder_destroy"] = asm["_opus_decoder_destroy"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _opus_decode_float = Module["_opus_decode_float"] = asm["_opus_decode_float"];
var _bitshift64Ashr = Module["_bitshift64Ashr"] = asm["_bitshift64Ashr"];
var _memset = Module["_memset"] = asm["_memset"];
var _speex_resampler_process_interleaved_float = Module["_speex_resampler_process_interleaved_float"] = asm["_speex_resampler_process_interleaved_float"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _speex_resampler_init = Module["_speex_resampler_init"] = asm["_speex_resampler_init"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _opus_decoder_ctl = Module["_opus_decoder_ctl"] = asm["_opus_decoder_ctl"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
Runtime.stackAlloc = asm["stackAlloc"];
Runtime.stackSave = asm["stackSave"];
Runtime.stackRestore = asm["stackRestore"];
Runtime.establishStackSpace = asm["establishStackSpace"];
Runtime.setTempRet0 = asm["setTempRet0"];
Runtime.getTempRet0 = asm["getTempRet0"];

function ExitStatus(status) {
	this.name = "ExitStatus";
	this.message = "Program terminated with exit(" + status + ")";
	this.status = status
}
ExitStatus.prototype = new Error;
ExitStatus.prototype.constructor = ExitStatus;
var initialStackTop;
var preloadStartTime = null;
var calledMain = false;
dependenciesFulfilled = function runCaller() {
	if (!Module["calledRun"]) run();
	if (!Module["calledRun"]) dependenciesFulfilled = runCaller
};
Module["callMain"] = Module.callMain = function callMain(args) {
	assert(runDependencies == 0, "cannot call main when async dependencies remain! (listen on __ATMAIN__)");
	assert(__ATPRERUN__.length == 0, "cannot call main when preRun functions remain to be called");
	args = args || [];
	ensureInitRuntime();
	var argc = args.length + 1;

	function pad() {
		for (var i = 0; i < 4 - 1; i++) {
			argv.push(0)
		}
	}
	var argv = [allocate(intArrayFromString(Module["thisProgram"]), "i8", ALLOC_NORMAL)];
	pad();
	for (var i = 0; i < argc - 1; i = i + 1) {
		argv.push(allocate(intArrayFromString(args[i]), "i8", ALLOC_NORMAL));
		pad()
	}
	argv.push(0);
	argv = allocate(argv, "i32", ALLOC_NORMAL);
	initialStackTop = Runtime.stackSave();
	try {
		var ret = Module["_main"](argc, argv, 0);
		exit(ret, true)
	} catch (e) {
		if (e instanceof ExitStatus) {
			return
		} else if (e == "SimulateInfiniteLoop") {
			Module["noExitRuntime"] = true;
			Runtime.stackRestore(initialStackTop);
			return
		} else {
			if (e && typeof e === "object" && e.stack) Module.printErr("exception thrown: " + [e, e.stack]);
			throw e
		}
	} finally {
		calledMain = true
	}
};

function run(args) {
	args = args || Module["arguments"];
	if (preloadStartTime === null) preloadStartTime = Date.now();
	if (runDependencies > 0) {
		return
	}
	preRun();
	if (runDependencies > 0) return;
	if (Module["calledRun"]) return;

	function doRun() {
		if (Module["calledRun"]) return;
		Module["calledRun"] = true;
		if (ABORT) return;
		ensureInitRuntime();
		preMain();
		if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
		if (Module["_main"] && shouldRunNow) Module["callMain"](args);
		postRun()
	}
	if (Module["setStatus"]) {
		Module["setStatus"]("Running...");
		setTimeout((function() {
			setTimeout((function() {
				Module["setStatus"]("")
			}), 1);
			doRun()
		}), 1)
	} else {
		doRun()
	}
}
Module["run"] = Module.run = run;

function exit(status, implicit) {
	if (implicit && Module["noExitRuntime"]) {
		return
	}
	if (Module["noExitRuntime"]) {} else {
		ABORT = true;
		EXITSTATUS = status;
		STACKTOP = initialStackTop;
		exitRuntime();
		if (Module["onExit"]) Module["onExit"](status)
	}
	if (ENVIRONMENT_IS_NODE) {
		process["stdout"]["once"]("drain", (function() {
			process["exit"](status)
		}));
		console.log(" ");
		setTimeout((function() {
			process["exit"](status)
		}), 500)
	} else if (ENVIRONMENT_IS_SHELL && typeof quit === "function") {
		quit(status)
	}
	throw new ExitStatus(status)
}
Module["exit"] = Module.exit = exit;
var abortDecorators = [];

function abort(what) {
	if (what !== undefined) {
		Module.print(what);
		Module.printErr(what);
		what = JSON.stringify(what)
	} else {
		what = ""
	}
	ABORT = true;
	EXITSTATUS = 1;
	var extra = "\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.";
	var output = "abort(" + what + ") at " + stackTrace() + extra;
	if (abortDecorators) {
		abortDecorators.forEach((function(decorator) {
			output = decorator(output, what)
		}))
	}
	throw output
}
Module["abort"] = Module.abort = abort;
if (Module["preInit"]) {
	if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
	while (Module["preInit"].length > 0) {
		Module["preInit"].pop()()
	}
}
var shouldRunNow = true;
if (Module["noInitialRun"]) {
	shouldRunNow = false
}
run();
var workerResponded = false,
	workerCallbackId = -1;
((function() {
	var messageBuffer = null,
		buffer = 0,
		bufferSize = 0;

	function flushMessages() {
		if (!messageBuffer) return;
		if (runtimeInitialized) {
			var temp = messageBuffer;
			messageBuffer = null;
			temp.forEach((function(message) {
				onmessage(message)
			}))
		}
	}

	function messageResender() {
		flushMessages();
		if (messageBuffer) {
			setTimeout(messageResender, 100)
		}
	}
	onmessage = function onmessage(msg) {
		if (!runtimeInitialized) {
			if (!messageBuffer) {
				messageBuffer = [];
				setTimeout(messageResender, 100)
			}
			messageBuffer.push(msg);
			return
		}
		flushMessages();
		var func = Module["_" + msg.data["funcName"]];
		if (!func) throw "invalid worker function to call: " + msg.data["funcName"];
		var data = msg.data["data"];
		if (data) {
			if (!data.byteLength) data = new Uint8Array(data);
			if (!buffer || bufferSize < data.length) {
				if (buffer) _free(buffer);
				bufferSize = data.length;
				buffer = _malloc(data.length)
			}
			HEAPU8.set(data, buffer)
		}
		workerResponded = false;
		workerCallbackId = msg.data["callbackId"];
		if (data) {
			func(buffer, data.length)
		} else {
			func(0, 0)
		}
	}
}))();
var OpusDecoder = (function() {
	function OpusDecoder(worker) {
		var _this = this;
		this.worker = worker;
		this.worker.onmessage = (function(ev) {
			_this.setup(ev.data.config, ev.data.packets)
		})
	}
	OpusDecoder.prototype.setup = (function(config, packets) {
		var _this = this;
        this.channels = 1
        var sampling_rate = 44100; // 48000
		if (packets.length == 1 && packets[0].data.byteLength == 19) {
            var invalid = false;
            var view8 = new Uint8Array(packets[0].data);
            var view32 = new Uint32Array(packets[0].data, 12, 1);
            var magic = "OpusHead";
            for (var i = 0; i < magic.length; ++i) {
                if (view8[i] != magic.charCodeAt(i)) invalid = true
            }
            invalid = invalid || view8[8] != 1;
            this.channels = view8[9];
            invalid = invalid || this.channels == 0 || this.channels > 2;
            var sampling_rate = view32[0];
            invalid = invalid || view8[18] != 0;
            if (invalid) {
                this.worker.postMessage({
                    status: -1,
                    reason: "invalid opus header packet"
                });
                return
            }
		} else {
            this.channels = config.channels;
            sampling_rate = config.sampling_rate;
        }
		var err = Module._malloc(4);
		this.handle = _opus_decoder_create(sampling_rate, this.channels, err);
		var err_num = Module.getValue(err, "i32");
		Module._free(err);
		if (err_num != 0) {
			this.worker.postMessage({
				status: err_num
			});
			return
		}
		this.frame_size = sampling_rate * 60 / 1e3;
		var buf_size = 1275 * 3 + 7;
		var pcm_samples = this.frame_size * this.channels;
		this.buf_ptr = Module._malloc(buf_size);
		this.pcm_ptr = Module._malloc(4 * pcm_samples);
		this.buf = Module.HEAPU8.subarray(this.buf_ptr, this.buf_ptr + buf_size);
		this.pcm = Module.HEAPF32.subarray(this.pcm_ptr / 4, this.pcm_ptr / 4 + pcm_samples);
		this.worker.onmessage = (function(ev) {
			_this.decode(ev.data)
		});
		this.worker.postMessage({
			status: 0,
			sampling_rate: sampling_rate,
			num_of_channels: this.channels
		})
	});
	OpusDecoder.prototype.decode = (function(packet) {
		this.buf.set(new Uint8Array(packet.data));
		var ret = _opus_decode_float(this.handle, this.buf_ptr, packet.data.byteLength, this.pcm_ptr, this.frame_size, 0);
		if (ret < 0) {
			this.worker.postMessage({
				status: ret
			});
			return
		}
		var buf = {
			status: 0,
			timestamp: 0,
			samples: new Float32Array(this.pcm.subarray(0, ret * this.channels)),
			transferable: true
		};
		this.worker.postMessage(buf, [buf.samples.buffer])
	});
	return OpusDecoder
})();
new OpusDecoder(this)
