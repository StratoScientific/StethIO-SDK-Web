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
STATICTOP = STATIC_BASE + 36512;
__ATINIT__.push();
allocate([200, 81, 12, 210, 132, 244, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 200, 81, 12, 210, 132, 244, 239, 63, 246, 149, 7, 233, 41, 210, 239, 63, 218, 211, 196, 241, 50, 153, 239, 63, 212, 253, 16, 217, 15, 74, 239, 63, 126, 159, 187, 110, 91, 229, 238, 63, 97, 193, 63, 157, 217, 107, 238, 63, 29, 215, 241, 37, 117, 222, 237, 63, 106, 127, 111, 236, 60, 62, 237, 63, 201, 234, 53, 193, 96, 140, 236, 63, 119, 36, 69, 1, 46, 202, 235, 63, 30, 188, 126, 218, 11, 249, 234, 63, 58, 208, 191, 52, 119, 26, 234, 63, 245, 37, 35, 128, 254, 47, 233, 63, 242, 64, 67, 131, 61, 59, 232, 63, 14, 7, 83, 222, 216, 61, 231, 63, 247, 242, 175, 163, 121, 57, 230, 63, 76, 200, 197, 32, 201, 47, 229, 63, 206, 184, 120, 145, 108, 34, 228, 63, 255, 153, 90, 25, 1, 19, 227, 63, 47, 156, 49, 237, 23, 3, 226, 63, 99, 217, 6, 205, 50, 244, 224, 63, 77, 90, 134, 114, 129, 207, 223, 63, 205, 143, 100, 251, 53, 190, 221, 63, 21, 198, 55, 144, 5, 183, 219, 63, 224, 7, 173, 168, 61, 188, 217, 63, 96, 51, 10, 147, 243, 207, 215, 63, 243, 29, 252, 196, 1, 244, 213, 63, 74, 133, 103, 248, 5, 42, 212, 63, 231, 205, 60, 20, 96, 115, 210, 63, 141, 202, 52, 55, 50, 209, 208, 63, 216, 209, 122, 240, 193, 136, 206, 63, 175, 39, 120, 18, 42, 155, 203, 63, 200, 72, 147, 222, 121, 218, 200, 63, 181, 207, 91, 35, 31, 71, 198, 63, 61, 87, 66, 20, 31, 225, 195, 63, 181, 205, 1, 64, 29, 168, 193, 63, 77, 186, 144, 187, 198, 54, 191, 63, 46, 12, 38, 56, 212, 115, 187, 63, 102, 146, 5, 10, 196, 4, 184, 63, 128, 84, 22, 199, 121, 230, 180, 63, 98, 72, 78, 38, 110, 21, 178, 63, 164, 21, 132, 151, 133, 27, 175, 63, 236, 178, 235, 32, 167, 150, 170, 63, 151, 168, 65, 69, 147, 147, 166, 63, 62, 120, 47, 239, 88, 9, 163, 63, 213, 231, 172, 71, 200, 221, 159, 63, 108, 207, 77, 23, 57, 118, 154, 63, 244, 241, 216, 232, 255, 201, 149, 63, 15, 11, 181, 166, 121, 199, 145, 63, 85, 23, 108, 250, 30, 187, 140, 63, 254, 164, 177, 40, 178, 247, 134, 63, 60, 183, 150, 234, 126, 37, 130, 63, 165, 251, 181, 204, 84, 78, 124, 63, 103, 31, 84, 119, 159, 194, 117, 63, 5, 196, 127, 21, 59, 117, 112, 63, 116, 127, 179, 156, 157, 111, 104, 63, 211, 240, 243, 0, 146, 192, 97, 63, 247, 82, 219, 250, 167, 35, 89, 63, 63, 193, 172, 237, 121, 64, 81, 63, 241, 66, 0, 145, 250, 194, 70, 63, 123, 178, 205, 83, 62, 128, 60, 63, 38, 81, 146, 34, 240, 143, 48, 63, 199, 84, 110, 96, 122, 20, 33, 63, 125, 137, 127, 55, 32, 171, 11, 63, 241, 104, 227, 136, 181, 248, 228, 62, 0, 0, 0, 0, 0, 0, 0, 0, 185, 166, 163, 144, 34, 218, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 185, 166, 163, 144, 34, 218, 239, 63, 133, 11, 22, 218, 123, 105, 239, 63, 68, 70, 205, 120, 215, 176, 238, 63, 38, 83, 195, 134, 192, 180, 237, 63, 51, 218, 46, 93, 86, 123, 236, 63, 169, 206, 23, 57, 19, 12, 235, 63, 169, 234, 113, 33, 135, 111, 233, 63, 114, 230, 145, 30, 10, 175, 231, 63, 214, 209, 105, 196, 105, 212, 229, 63, 192, 167, 164, 20, 149, 233, 227, 63, 57, 160, 0, 229, 74, 248, 225, 63, 234, 131, 27, 223, 205, 9, 224, 63, 85, 106, 213, 50, 66, 77, 220, 63, 67, 93, 222, 251, 159, 172, 216, 63, 15, 90, 246, 193, 133, 62, 213, 63, 31, 5, 219, 202, 67, 13, 210, 63, 160, 103, 55, 35, 24, 65, 206, 63, 140, 139, 122, 243, 225, 250, 200, 63, 240, 174, 72, 134, 251, 76, 196, 63, 116, 227, 39, 31, 204, 55, 192, 63, 238, 97, 138, 205, 34, 111, 185, 63, 59, 78, 85, 202, 0, 138, 179, 63, 232, 97, 46, 202, 232, 87, 173, 63, 36, 51, 205, 42, 34, 121, 165, 63, 187, 105, 109, 249, 204, 130, 158, 63, 34, 44, 116, 111, 143, 239, 148, 63, 62, 17, 221, 22, 217, 140, 139, 63, 93, 194, 95, 155, 166, 50, 129, 63, 80, 8, 178, 216, 5, 7, 116, 63, 129, 200, 42, 190, 4, 27, 101, 63, 220, 238, 171, 147, 175, 219, 82, 63, 27, 202, 154, 162, 109, 70, 55, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 193, 83, 76, 206, 30, 226, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 193, 83, 76, 206, 30, 226, 239, 63, 207, 66, 200, 154, 13, 137, 239, 63, 12, 109, 231, 152, 127, 246, 238, 63, 136, 18, 45, 121, 60, 45, 238, 63, 154, 77, 244, 183, 12, 49, 237, 63, 181, 176, 192, 186, 158, 6, 236, 63, 204, 153, 14, 25, 102, 179, 234, 63, 220, 121, 44, 199, 117, 61, 233, 63, 81, 171, 34, 187, 86, 171, 231, 63, 149, 54, 201, 77, 220, 3, 230, 63, 117, 171, 231, 164, 247, 77, 228, 63, 119, 0, 155, 222, 139, 144, 226, 63, 19, 129, 234, 31, 68, 210, 224, 63, 198, 0, 195, 209, 217, 50, 222, 63, 83, 62, 4, 85, 163, 215, 218, 63, 217, 8, 97, 193, 63, 157, 215, 63, 168, 106, 6, 225, 159, 140, 212, 63, 110, 36, 125, 24, 41, 173, 209, 63, 90, 239, 121, 246, 67, 9, 206, 63, 27, 0, 96, 43, 87, 46, 201, 63, 81, 150, 107, 27, 144, 206, 196, 63, 139, 236, 90, 173, 217, 235, 192, 63, 233, 214, 41, 94, 126, 10, 187, 63, 223, 23, 250, 212, 111, 46, 181, 63, 6, 13, 129, 76, 0, 56, 176, 63, 202, 189, 68, 229, 244, 47, 168, 63, 166, 21, 248, 237, 152, 120, 161, 63, 75, 245, 83, 210, 121, 67, 152, 63, 148, 207, 159, 244, 141, 1, 144, 63, 0, 110, 55, 61, 255, 168, 131, 63, 222, 105, 25, 70, 205, 153, 117, 63, 224, 133, 140, 203, 225, 40, 99, 63, 252, 169, 241, 210, 77, 98, 64, 63, 0, 0, 0, 0, 0, 0, 0, 0, 37, 145, 224, 186, 32, 234, 239, 63, 0, 0, 0, 0, 0, 0, 240, 63, 37, 145, 224, 186, 32, 234, 239, 63, 222, 75, 43, 207, 205, 168, 239, 63, 90, 31, 255, 154, 230, 60, 239, 63, 85, 207, 23, 181, 218, 167, 238, 63, 190, 160, 100, 246, 162, 235, 237, 63, 215, 144, 110, 58, 184, 10, 237, 63, 139, 232, 207, 101, 7, 8, 236, 63, 181, 222, 111, 180, 227, 230, 234, 63, 88, 0, 116, 20, 247, 170, 233, 63, 34, 114, 85, 52, 49, 88, 232, 63, 80, 197, 174, 105, 181, 242, 230, 63, 88, 228, 182, 1, 200, 126, 229, 63, 148, 69, 39, 108, 187, 0, 228, 63, 71, 43, 74, 75, 221, 124, 226, 63, 169, 163, 227, 106, 100, 247, 224, 63, 170, 169, 151, 165, 190, 232, 222, 63, 22, 196, 122, 130, 72, 239, 219, 63, 75, 102, 204, 143, 133, 9, 217, 63, 63, 233, 225, 87, 238, 61, 214, 63, 194, 106, 110, 125, 63, 146, 211, 63, 160, 190, 167, 106, 105, 11, 209, 63, 43, 114, 95, 57, 8, 91, 205, 63, 39, 153, 98, 47, 144, 247, 200, 63, 161, 7, 202, 175, 23, 241, 196, 63, 202, 98, 172, 128, 140, 74, 193, 63, 34, 197, 190, 108, 84, 10, 188, 63, 97, 133, 0, 133, 31, 65, 182, 63, 143, 222, 112, 31, 185, 53, 177, 63, 67, 132, 201, 158, 78, 195, 169, 63, 33, 123, 123, 223, 17, 120, 162, 63, 243, 71, 40, 232, 188, 231, 152, 63, 89, 237, 14, 231, 233, 117, 142, 63, 33, 2, 14, 161, 74, 205, 126, 63, 0, 0, 0, 0, 0, 0, 0, 0, 93, 61, 127, 102, 158, 160, 230, 63, 0, 0, 0, 0, 0, 136, 57, 61, 68, 23, 117, 250, 82, 176, 230, 63, 0, 0, 0, 0, 0, 0, 216, 60, 254, 217, 11, 117, 18, 192, 230, 63, 0, 0, 0, 0, 0, 120, 40, 189, 191, 118, 212, 221, 220, 207, 230, 63, 0, 0, 0, 0, 0, 192, 30, 61, 41, 26, 101, 60, 178, 223, 230, 63, 0, 0, 0, 0, 0, 0, 216, 188, 227, 58, 89, 152, 146, 239, 230, 63, 0, 0, 0, 0, 0, 0, 188, 188, 134, 147, 81, 249, 125, 255, 230, 63, 0, 0, 0, 0, 0, 216, 47, 189, 163, 45, 244, 102, 116, 15, 231, 63, 0, 0, 0, 0, 0, 136, 44, 189, 195, 95, 236, 232, 117, 31, 231, 63, 0, 0, 0, 0, 0, 192, 19, 61, 5, 207, 234, 134, 130, 47, 231, 63, 0, 0, 0, 0, 0, 48, 56, 189, 82, 129, 165, 72, 154, 63, 231, 63, 0, 0, 0, 0, 0, 192, 0, 189, 252, 204, 215, 53, 189, 79, 231, 63, 0, 0, 0, 0, 0, 136, 47, 61, 241, 103, 66, 86, 235, 95, 231, 63, 0, 0, 0, 0, 0, 224, 3, 61, 72, 109, 171, 177, 36, 112, 231, 63, 0, 0, 0, 0, 0, 208, 39, 189, 56, 93, 222, 79, 105, 128, 231, 63, 0, 0, 0, 0, 0, 0, 221, 188, 0, 29, 172, 56, 185, 144, 231, 63, 0, 0, 0, 0, 0, 0, 227, 60, 120, 1, 235, 115, 20, 161, 231, 63, 0, 0, 0, 0, 0, 0, 237, 188, 96, 208, 118, 9, 123, 177, 231, 63, 0, 0, 0, 0, 0, 64, 32, 61, 51, 193, 48, 1, 237, 193, 231, 63, 0, 0, 0, 0, 0, 0, 160, 60, 54, 134, 255, 98, 106, 210, 231, 63, 0, 0, 0, 0, 0, 144, 38, 189, 59, 78, 207, 54, 243, 226, 231, 63, 0, 0, 0, 0, 0, 224, 2, 189, 232, 195, 145, 132, 135, 243, 231, 63, 0, 0, 0, 0, 0, 88, 36, 189, 78, 27, 62, 84, 39, 4, 232, 63, 0, 0, 0, 0, 0, 0, 51, 61, 26, 7, 209, 173, 210, 20, 232, 63, 0, 0, 0, 0, 0, 0, 15, 61, 126, 205, 76, 153, 137, 37, 232, 63, 0, 0, 0, 0, 0, 192, 33, 189, 208, 66, 185, 30, 76, 54, 232, 63, 0, 0, 0, 0, 0, 208, 41, 61, 181, 202, 35, 70, 26, 71, 232, 63, 0, 0, 0, 0, 0, 16, 71, 61, 188, 91, 159, 23, 244, 87, 232, 63, 0, 0, 0, 0, 0, 96, 34, 61, 175, 145, 68, 155, 217, 104, 232, 63, 0, 0, 0, 0, 0, 196, 50, 189, 149, 163, 49, 217, 202, 121, 232, 63, 0, 0, 0, 0, 0, 0, 35, 189, 184, 101, 138, 217, 199, 138, 232, 63, 0, 0, 0, 0, 0, 128, 42, 189, 0, 88, 120, 164, 208, 155, 232, 63, 0, 0, 0, 0, 0, 0, 237, 188, 35, 162, 42, 66, 229, 172, 232, 63, 0, 0, 0, 0, 0, 40, 51, 61, 250, 25, 214, 186, 5, 190, 232, 63, 0, 0, 0, 0, 0, 180, 66, 61, 131, 67, 181, 22, 50, 207, 232, 63, 0, 0, 0, 0, 0, 208, 46, 189, 76, 102, 8, 94, 106, 224, 232, 63, 0, 0, 0, 0, 0, 80, 32, 189, 7, 120, 21, 153, 174, 241, 232, 63, 0, 0, 0, 0, 0, 40, 40, 61, 14, 44, 40, 208, 254, 2, 233, 63, 0, 0, 0, 0, 0, 176, 28, 189, 150, 255, 145, 11, 91, 20, 233, 63, 0, 0, 0, 0, 0, 224, 5, 189, 249, 47, 170, 83, 195, 37, 233, 63, 0, 0, 0, 0, 0, 64, 245, 60, 74, 198, 205, 176, 55, 55, 233, 63, 0, 0, 0, 0, 0, 32, 23, 61, 174, 152, 95, 43, 184, 72, 233, 63, 0, 0, 0, 0, 0, 0, 9, 189, 203, 82, 200, 203, 68, 90, 233, 63, 0, 0, 0, 0, 0, 104, 37, 61, 33, 111, 118, 154, 221, 107, 233, 63, 0, 0, 0, 0, 0, 208, 54, 189, 42, 78, 222, 159, 130, 125, 233, 63, 0, 0, 0, 0, 0, 0, 1, 189, 163, 35, 122, 228, 51, 143, 233, 63, 0, 0, 0, 0, 0, 0, 45, 61, 4, 6, 202, 112, 241, 160, 233, 63, 0, 0, 0, 0, 0, 164, 56, 189, 137, 255, 83, 77, 187, 178, 233, 63, 0, 0, 0, 0, 0, 92, 53, 61, 91, 241, 163, 130, 145, 196, 233, 63, 0, 0, 0, 0, 0, 184, 38, 61, 197, 184, 75, 25, 116, 214, 233, 63, 0, 0, 0, 0, 0, 0, 236, 188, 142, 35, 227, 25, 99, 232, 233, 63, 0, 0, 0, 0, 0, 208, 23, 61, 2, 243, 7, 141, 94, 250, 233, 63, 0, 0, 0, 0, 0, 64, 22, 61, 77, 229, 93, 123, 102, 12, 234, 63, 0, 0, 0, 0, 0, 0, 245, 188, 246, 184, 142, 237, 122, 30, 234, 63, 0, 0, 0, 0, 0, 224, 9, 61, 39, 46, 74, 236, 155, 48, 234, 63, 0, 0, 0, 0, 0, 216, 42, 61, 93, 10, 70, 128, 201, 66, 234, 63, 0, 0, 0, 0, 0, 240, 26, 189, 155, 37, 62, 178, 3, 85, 234, 63, 0, 0, 0, 0, 0, 96, 11, 61, 19, 98, 244, 138, 74, 103, 234, 63, 0, 0, 0, 0, 0, 136, 56, 61, 167, 179, 48, 19, 158, 121, 234, 63, 0, 0, 0, 0, 0, 32, 17, 61, 141, 46, 193, 83, 254, 139, 234, 63, 0, 0, 0, 0, 0, 192, 6, 61, 210, 252, 121, 85, 107, 158, 234, 63, 0, 0, 0, 0, 0, 184, 41, 189, 184, 111, 53, 33, 229, 176, 234, 63, 0, 0, 0, 0, 0, 112, 43, 61, 129, 243, 211, 191, 107, 195, 234, 63, 0, 0, 0, 0, 0, 0, 217, 60, 128, 39, 60, 58, 255, 213, 234, 63, 0, 0, 0, 0, 0, 0, 228, 60, 163, 210, 90, 153, 159, 232, 234, 63, 0, 0, 0, 0, 0, 144, 44, 189, 103, 243, 34, 230, 76, 251, 234, 63, 0, 0, 0, 0, 0, 80, 22, 61, 144, 183, 141, 41, 7, 14, 235, 63, 0, 0, 0, 0, 0, 212, 47, 61, 169, 137, 154, 108, 206, 32, 235, 63, 0, 0, 0, 0, 0, 112, 18, 61, 75, 26, 79, 184, 162, 51, 235, 63, 0, 0, 0, 0, 0, 71, 77, 61, 231, 71, 183, 21, 132, 70, 235, 63, 0, 0, 0, 0, 0, 56, 56, 189, 58, 89, 229, 141, 114, 89, 235, 63, 0, 0, 0, 0, 0, 0, 152, 60, 106, 197, 241, 41, 110, 108, 235, 63, 0, 0, 0, 0, 0, 208, 10, 61, 80, 94, 251, 242, 118, 127, 235, 63, 0, 0, 0, 0, 0, 128, 222, 60, 178, 73, 39, 242, 140, 146, 235, 63, 0, 0, 0, 0, 0, 192, 4, 189, 3, 6, 161, 48, 176, 165, 235, 63, 0, 0, 0, 0, 0, 112, 13, 189, 102, 111, 154, 183, 224, 184, 235, 63, 0, 0, 0, 0, 0, 144, 13, 61, 255, 193, 75, 144, 30, 204, 235, 63, 0, 0, 0, 0, 0, 160, 2, 61, 111, 161, 243, 195, 105, 223, 235, 63, 0, 0, 0, 0, 0, 120, 31, 189, 184, 29, 215, 91, 194, 242, 235, 63, 0, 0, 0, 0, 0, 160, 16, 189, 233, 178, 65, 97, 40, 6, 236, 63, 0, 0, 0, 0, 0, 64, 17, 189, 224, 82, 133, 221, 155, 25, 236, 63, 0, 0, 0, 0, 0, 224, 11, 61, 238, 100, 250, 217, 28, 45, 236, 63, 0, 0, 0, 0, 0, 64, 9, 189, 47, 208, 255, 95, 171, 64, 236, 63, 0, 0, 0, 0, 0, 208, 14, 189, 21, 253, 250, 120, 71, 84, 236, 63, 0, 0, 0, 0, 0, 102, 57, 61, 203, 208, 87, 46, 241, 103, 236, 63, 0, 0, 0, 0, 0, 16, 26, 189, 182, 193, 136, 137, 168, 123, 236, 63, 0, 0, 0, 0, 128, 69, 88, 189, 51, 231, 6, 148, 109, 143, 236, 63, 0, 0, 0, 0, 0, 72, 26, 189, 223, 196, 81, 87, 64, 163, 236, 63, 0, 0, 0, 0, 0, 0, 203, 60, 148, 144, 239, 220, 32, 183, 236, 63, 0, 0, 0, 0, 0, 64, 1, 61, 137, 22, 109, 46, 15, 203, 236, 63, 0, 0, 0, 0, 0, 32, 240, 60, 18, 196, 93, 85, 11, 223, 236, 63, 0, 0, 0, 0, 0, 96, 243, 60, 59, 171, 91, 91, 21, 243, 236, 63, 0, 0, 0, 0, 0, 144, 6, 189, 188, 137, 7, 74, 45, 7, 237, 63, 0, 0, 0, 0, 0, 160, 9, 61, 250, 200, 8, 43, 83, 27, 237, 63, 0, 0, 0, 0, 0, 224, 21, 189, 133, 138, 13, 8, 135, 47, 237, 63, 0, 0, 0, 0, 0, 40, 29, 61, 3, 162, 202, 234, 200, 67, 237, 63, 0, 0, 0, 0, 0, 160, 1, 61, 145, 164, 251, 220, 24, 88, 237, 63, 0, 0, 0, 0, 0, 0, 223, 60, 161, 230, 98, 232, 118, 108, 237, 63, 0, 0, 0, 0, 0, 160, 3, 189, 78, 131, 201, 22, 227, 128, 237, 63, 0, 0, 0, 0, 0, 216, 12, 189, 144, 96, 255, 113, 93, 149, 237, 63, 0, 0, 0, 0, 0, 192, 244, 60, 174, 50, 219, 3, 230, 169, 237, 63, 0, 0, 0, 0, 0, 144, 255, 60, 37, 131, 58, 214, 124, 190, 237, 63, 0, 0, 0, 0, 0, 128, 233, 60, 69, 180, 1, 243, 33, 211, 237, 63, 0, 0, 0, 0, 0, 32, 245, 188, 191, 5, 28, 100, 213, 231, 237, 63, 0, 0, 0, 0, 0, 112, 29, 189, 236, 154, 123, 51, 151, 252, 237, 63, 0, 0, 0, 0, 0, 20, 22, 189, 94, 125, 25, 107, 103, 17, 238, 63, 0, 0, 0, 0, 0, 72, 11, 61, 231, 163, 245, 20, 70, 38, 238, 63, 0, 0, 0, 0, 0, 206, 64, 61, 92, 238, 22, 59, 51, 59, 238, 63, 0, 0, 0, 0, 0, 104, 12, 61, 180, 63, 139, 231, 46, 80, 238, 63, 0, 0, 0, 0, 0, 48, 9, 189, 104, 109, 103, 36, 57, 101, 238, 63, 0, 0, 0, 0, 0, 0, 229, 188, 68, 76, 199, 251, 81, 122, 238, 63, 0, 0, 0, 0, 0, 248, 7, 189, 38, 183, 205, 119, 121, 143, 238, 63, 0, 0, 0, 0, 0, 112, 243, 188, 232, 144, 164, 162, 175, 164, 238, 63, 0, 0, 0, 0, 0, 208, 229, 60, 228, 202, 124, 134, 244, 185, 238, 63, 0, 0, 0, 0, 0, 26, 22, 61, 13, 104, 142, 45, 72, 207, 238, 63, 0, 0, 0, 0, 0, 80, 245, 60, 20, 133, 24, 162, 170, 228, 238, 63, 0, 0, 0, 0, 0, 64, 198, 60, 19, 90, 97, 238, 27, 250, 238, 63, 0, 0, 0, 0, 0, 128, 238, 188, 6, 65, 182, 28, 156, 15, 239, 63, 0, 0, 0, 0, 0, 136, 250, 188, 99, 185, 107, 55, 43, 37, 239, 63, 0, 0, 0, 0, 0, 144, 44, 189, 117, 114, 221, 72, 201, 58, 239, 63, 0, 0, 0, 0, 0, 0, 170, 60, 36, 69, 110, 91, 118, 80, 239, 63, 0, 0, 0, 0, 0, 240, 244, 188, 253, 68, 136, 121, 50, 102, 239, 63, 0, 0, 0, 0, 0, 128, 202, 60, 56, 190, 156, 173, 253, 123, 239, 63, 0, 0, 0, 0, 0, 188, 250, 60, 130, 60, 36, 2, 216, 145, 239, 63, 0, 0, 0, 0, 0, 96, 212, 188, 142, 144, 158, 129, 193, 167, 239, 63, 0, 0, 0, 0, 0, 12, 11, 189, 17, 213, 146, 54, 186, 189, 239, 63, 0, 0, 0, 0, 0, 224, 192, 188, 148, 113, 143, 43, 194, 211, 239, 63, 0, 0, 0, 0, 128, 222, 16, 189, 238, 35, 42, 107, 217, 233, 239, 63, 0, 0, 0, 0, 0, 67, 238, 60, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 0, 190, 188, 90, 250, 26, 11, 240, 63, 0, 0, 0, 0, 0, 64, 179, 188, 3, 51, 251, 169, 61, 22, 240, 63, 0, 0, 0, 0, 0, 23, 18, 189, 130, 2, 59, 20, 104, 33, 240, 63, 0, 0, 0, 0, 0, 64, 186, 60, 108, 128, 119, 62, 154, 44, 240, 63, 0, 0, 0, 0, 0, 152, 239, 60, 202, 187, 17, 46, 212, 55, 240, 63, 0, 0, 0, 0, 0, 64, 199, 188, 137, 127, 110, 232, 21, 67, 240, 63, 0, 0, 0, 0, 0, 48, 216, 60, 103, 84, 246, 114, 95, 78, 240, 63, 0, 0, 0, 0, 0, 63, 26, 189, 90, 133, 21, 211, 176, 89, 240, 63, 0, 0, 0, 0, 0, 132, 2, 189, 149, 31, 60, 14, 10, 101, 240, 63, 0, 0, 0, 0, 0, 96, 241, 60, 26, 247, 221, 41, 107, 112, 240, 63, 0, 0, 0, 0, 0, 36, 21, 61, 45, 168, 114, 43, 212, 123, 240, 63, 0, 0, 0, 0, 0, 160, 233, 188, 208, 155, 117, 24, 69, 135, 240, 63, 0, 0, 0, 0, 0, 64, 230, 60, 200, 7, 102, 246, 189, 146, 240, 63, 0, 0, 0, 0, 0, 120, 0, 189, 131, 243, 198, 202, 62, 158, 240, 63, 0, 0, 0, 0, 0, 0, 152, 188, 48, 57, 31, 155, 199, 169, 240, 63, 0, 0, 0, 0, 0, 160, 255, 60, 252, 136, 249, 108, 88, 181, 240, 63, 0, 0, 0, 0, 0, 200, 250, 188, 138, 108, 228, 69, 241, 192, 240, 63, 0, 0, 0, 0, 0, 192, 217, 60, 22, 72, 114, 43, 146, 204, 240, 63, 0, 0, 0, 0, 0, 32, 5, 61, 216, 93, 57, 35, 59, 216, 240, 63, 0, 0, 0, 0, 0, 208, 250, 188, 243, 209, 211, 50, 236, 227, 240, 63, 0, 0, 0, 0, 0, 172, 27, 61, 166, 169, 223, 95, 165, 239, 240, 63, 0, 0, 0, 0, 0, 232, 4, 189, 240, 210, 254, 175, 102, 251, 240, 63, 0, 0, 0, 0, 0, 48, 13, 189, 75, 35, 215, 40, 48, 7, 241, 63, 0, 0, 0, 0, 0, 80, 241, 60, 91, 91, 18, 208, 1, 19, 241, 63, 0, 0, 0, 0, 0, 0, 236, 60, 249, 42, 94, 171, 219, 30, 241, 63, 0, 0, 0, 0, 0, 188, 22, 61, 213, 49, 108, 192, 189, 42, 241, 63, 0, 0, 0, 0, 0, 64, 232, 60, 125, 4, 242, 20, 168, 54, 241, 63, 0, 0, 0, 0, 0, 208, 14, 189, 233, 45, 169, 174, 154, 66, 241, 63, 0, 0, 0, 0, 0, 224, 232, 60, 56, 49, 79, 147, 149, 78, 241, 63, 0, 0, 0, 0, 0, 64, 235, 60, 113, 142, 165, 200, 152, 90, 241, 63, 0, 0, 0, 0, 0, 48, 5, 61, 223, 195, 113, 84, 164, 102, 241, 63, 0, 0, 0, 0, 0, 56, 3, 61, 17, 82, 125, 60, 184, 114, 241, 63, 0, 0, 0, 0, 0, 212, 40, 61, 159, 187, 149, 134, 212, 126, 241, 63, 0, 0, 0, 0, 0, 208, 5, 189, 147, 141, 140, 56, 249, 138, 241, 63, 0, 0, 0, 0, 0, 136, 28, 189, 102, 93, 55, 88, 38, 151, 241, 63, 0, 0, 0, 0, 0, 240, 17, 61, 167, 203, 111, 235, 91, 163, 241, 63, 0, 0, 0, 0, 0, 72, 16, 61, 227, 135, 19, 248, 153, 175, 241, 63, 0, 0, 0, 0, 0, 57, 71, 189, 84, 93, 4, 132, 224, 187, 241, 63, 0, 0, 0, 0, 0, 228, 36, 61, 67, 28, 40, 149, 47, 200, 241, 63, 0, 0, 0, 0, 0, 32, 10, 189, 178, 185, 104, 49, 135, 212, 241, 63, 0, 0, 0, 0, 0, 128, 227, 60, 49, 64, 180, 94, 231, 224, 241, 63, 0, 0, 0, 0, 0, 192, 234, 60, 56, 217, 252, 34, 80, 237, 241, 63, 0, 0, 0, 0, 0, 144, 1, 61, 247, 205, 56, 132, 193, 249, 241, 63, 0, 0, 0, 0, 0, 120, 27, 189, 143, 141, 98, 136, 59, 6, 242, 63, 0, 0, 0, 0, 0, 148, 45, 61, 30, 168, 120, 53, 190, 18, 242, 63, 0, 0, 0, 0, 0, 0, 216, 60, 65, 221, 125, 145, 73, 31, 242, 63, 0, 0, 0, 0, 0, 52, 43, 61, 35, 19, 121, 162, 221, 43, 242, 63, 0, 0, 0, 0, 0, 248, 25, 61, 231, 97, 117, 110, 122, 56, 242, 63, 0, 0, 0, 0, 0, 200, 25, 189, 39, 20, 130, 251, 31, 69, 242, 63, 0, 0, 0, 0, 0, 48, 2, 61, 2, 166, 178, 79, 206, 81, 242, 63, 0, 0, 0, 0, 0, 72, 19, 189, 176, 206, 30, 113, 133, 94, 242, 63, 0, 0, 0, 0, 0, 112, 18, 61, 22, 125, 226, 101, 69, 107, 242, 63, 0, 0, 0, 0, 0, 208, 17, 61, 15, 224, 29, 52, 14, 120, 242, 63, 0, 0, 0, 0, 0, 238, 49, 61, 62, 99, 245, 225, 223, 132, 242, 63, 0, 0, 0, 0, 0, 192, 20, 189, 48, 187, 145, 117, 186, 145, 242, 63, 0, 0, 0, 0, 0, 216, 19, 189, 9, 223, 31, 245, 157, 158, 242, 63, 0, 0, 0, 0, 0, 176, 8, 61, 155, 14, 209, 102, 138, 171, 242, 63, 0, 0, 0, 0, 0, 124, 34, 189, 58, 218, 218, 208, 127, 184, 242, 63, 0, 0, 0, 0, 0, 52, 42, 61, 249, 26, 119, 57, 126, 197, 242, 63, 0, 0, 0, 0, 0, 128, 16, 189, 217, 2, 228, 166, 133, 210, 242, 63, 0, 0, 0, 0, 0, 208, 14, 189, 121, 21, 100, 31, 150, 223, 242, 63, 0, 0, 0, 0, 0, 32, 244, 188, 207, 46, 62, 169, 175, 236, 242, 63, 0, 0, 0, 0, 0, 152, 36, 189, 34, 136, 189, 74, 210, 249, 242, 63, 0, 0, 0, 0, 0, 48, 22, 189, 37, 182, 49, 10, 254, 6, 243, 63, 0, 0, 0, 0, 0, 54, 50, 189, 11, 165, 238, 237, 50, 20, 243, 63, 0, 0, 0, 0, 128, 223, 112, 189, 184, 215, 76, 252, 112, 33, 243, 63, 0, 0, 0, 0, 0, 72, 34, 189, 162, 233, 168, 59, 184, 46, 243, 63, 0, 0, 0, 0, 0, 152, 37, 189, 102, 23, 100, 178, 8, 60, 243, 63, 0, 0, 0, 0, 0, 208, 30, 61, 39, 250, 227, 102, 98, 73, 243, 63, 0, 0, 0, 0, 0, 0, 220, 188, 15, 159, 146, 95, 197, 86, 243, 63, 0, 0, 0, 0, 0, 216, 48, 189, 185, 136, 222, 162, 49, 100, 243, 63, 0, 0, 0, 0, 0, 200, 34, 61, 57, 170, 58, 55, 167, 113, 243, 63, 0, 0, 0, 0, 0, 96, 32, 61, 254, 116, 30, 35, 38, 127, 243, 63, 0, 0, 0, 0, 0, 96, 22, 189, 56, 216, 5, 109, 174, 140, 243, 63, 0, 0, 0, 0, 0, 224, 10, 189, 195, 62, 113, 27, 64, 154, 243, 63, 0, 0, 0, 0, 0, 114, 68, 189, 32, 160, 229, 52, 219, 167, 243, 63, 0, 0, 0, 0, 0, 32, 8, 61, 149, 110, 236, 191, 127, 181, 243, 63, 0, 0, 0, 0, 0, 128, 62, 61, 242, 168, 19, 195, 45, 195, 243, 63, 0, 0, 0, 0, 0, 128, 239, 60, 34, 225, 237, 68, 229, 208, 243, 63, 0, 0, 0, 0, 0, 160, 23, 189, 187, 52, 18, 76, 166, 222, 243, 63, 0, 0, 0, 0, 0, 48, 38, 61, 204, 78, 28, 223, 112, 236, 243, 63, 0, 0, 0, 0, 0, 166, 72, 189, 140, 126, 172, 4, 69, 250, 243, 63, 0, 0, 0, 0, 0, 220, 60, 189, 187, 160, 103, 195, 34, 8, 244, 63, 0, 0, 0, 0, 0, 184, 37, 61, 149, 46, 247, 33, 10, 22, 244, 63, 0, 0, 0, 0, 0, 192, 30, 61, 70, 70, 9, 39, 251, 35, 244, 63, 0, 0, 0, 0, 0, 96, 19, 189, 32, 169, 80, 217, 245, 49, 244, 63, 0, 0, 0, 0, 0, 152, 35, 61, 235, 185, 132, 63, 250, 63, 244, 63, 0, 0, 0, 0, 0, 0, 250, 60, 25, 137, 97, 96, 8, 78, 244, 63, 0, 0, 0, 0, 0, 192, 246, 188, 1, 210, 167, 66, 32, 92, 244, 63, 0, 0, 0, 0, 0, 192, 11, 189, 22, 0, 29, 237, 65, 106, 244, 63, 0, 0, 0, 0, 0, 128, 18, 189, 38, 51, 139, 102, 109, 120, 244, 63, 0, 0, 0, 0, 0, 224, 48, 61, 0, 60, 193, 181, 162, 134, 244, 63, 0, 0, 0, 0, 0, 64, 45, 189, 4, 175, 146, 225, 225, 148, 244, 63, 0, 0, 0, 0, 0, 32, 12, 61, 114, 211, 215, 240, 42, 163, 244, 63, 0, 0, 0, 0, 0, 80, 30, 189, 1, 184, 109, 234, 125, 177, 244, 63, 0, 0, 0, 0, 0, 128, 7, 61, 225, 41, 54, 213, 218, 191, 244, 63, 0, 0, 0, 0, 0, 128, 19, 189, 50, 193, 23, 184, 65, 206, 244, 63, 0, 0, 0, 0, 0, 128, 0, 61, 219, 221, 253, 153, 178, 220, 244, 63, 0, 0, 0, 0, 0, 112, 44, 61, 150, 171, 216, 129, 45, 235, 244, 63, 0, 0, 0, 0, 0, 224, 28, 189, 2, 45, 157, 118, 178, 249, 244, 63, 0, 0, 0, 0, 0, 32, 25, 61, 193, 49, 69, 127, 65, 8, 245, 63, 0, 0, 0, 0, 0, 192, 8, 189, 42, 102, 207, 162, 218, 22, 245, 63, 0, 0, 0, 0, 0, 0, 250, 188, 234, 81, 63, 232, 125, 37, 245, 63, 0, 0, 0, 0, 0, 8, 74, 61, 218, 78, 157, 86, 43, 52, 245, 63, 0, 0, 0, 0, 0, 216, 38, 189, 26, 172, 246, 244, 226, 66, 245, 63, 0, 0, 0, 0, 0, 68, 50, 189, 219, 148, 93, 202, 164, 81, 245, 63, 0, 0, 0, 0, 0, 60, 72, 61, 107, 17, 233, 221, 112, 96, 245, 63, 0, 0, 0, 0, 0, 176, 36, 61, 222, 41, 181, 54, 71, 111, 245, 63, 0, 0, 0, 0, 0, 90, 65, 61, 14, 196, 226, 219, 39, 126, 245, 63, 0, 0, 0, 0, 0, 224, 41, 189, 111, 199, 151, 212, 18, 141, 245, 63, 0, 0, 0, 0, 0, 8, 35, 189, 76, 11, 255, 39, 8, 156, 245, 63, 0, 0, 0, 0, 0, 236, 77, 61, 39, 84, 72, 221, 7, 171, 245, 63, 0, 0, 0, 0, 0, 0, 196, 188, 244, 122, 168, 251, 17, 186, 245, 63, 0, 0, 0, 0, 0, 8, 48, 61, 11, 70, 89, 138, 38, 201, 245, 63, 0, 0, 0, 0, 0, 200, 38, 189, 63, 142, 153, 144, 69, 216, 245, 63, 0, 0, 0, 0, 0, 154, 70, 61, 225, 32, 173, 21, 111, 231, 245, 63, 0, 0, 0, 0, 0, 64, 27, 189, 202, 235, 220, 32, 163, 246, 245, 63, 0, 0, 0, 0, 0, 112, 23, 61, 184, 220, 118, 185, 225, 5, 246, 63, 0, 0, 0, 0, 0, 248, 38, 61, 21, 247, 205, 230, 42, 21, 246, 63, 0, 0, 0, 0, 0, 0, 1, 61, 49, 85, 58, 176, 126, 36, 246, 63, 0, 0, 0, 0, 0, 208, 21, 189, 181, 41, 25, 29, 221, 51, 246, 63, 0, 0, 0, 0, 0, 208, 18, 189, 19, 195, 204, 52, 70, 67, 246, 63, 0, 0, 0, 0, 0, 128, 234, 188, 250, 142, 188, 254, 185, 82, 246, 63, 0, 0, 0, 0, 0, 96, 40, 189, 151, 51, 85, 130, 56, 98, 246, 63, 0, 0, 0, 0, 0, 254, 113, 61, 142, 50, 8, 199, 193, 113, 246, 63, 0, 0, 0, 0, 0, 32, 55, 189, 126, 169, 76, 212, 85, 129, 246, 63, 0, 0, 0, 0, 0, 128, 230, 60, 113, 148, 158, 177, 244, 144, 246, 63, 0, 0, 0, 0, 0, 120, 41, 189, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 7, 0, 0, 0, 12, 0, 0, 0, 3, 0, 0, 0, 11, 0, 0, 0, 4, 0, 0, 0, 14, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0, 6, 0, 0, 0, 13, 0, 0, 0, 2, 0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 0, 0, 0, 157, 62, 0, 64, 94, 62, 0, 192, 4, 62, 0, 128, 237, 62, 0, 64, 137, 62, 0, 0, 0, 0, 0, 192, 76, 63, 0, 0, 205, 61, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 128, 64, 0, 0, 160, 64, 0, 0, 192, 64, 0, 0, 224, 64, 0, 0, 0, 65, 0, 0, 128, 65, 0, 0, 192, 65, 0, 0, 16, 66, 0, 0, 48, 66, 0, 0, 72, 66, 0, 0, 96, 66, 0, 0, 120, 66, 0, 0, 134, 66, 0, 0, 144, 66, 0, 0, 158, 66, 0, 0, 176, 66, 0, 0, 212, 66, 0, 0, 6, 67, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 64, 64, 0, 0, 128, 64, 0, 0, 160, 64, 0, 0, 192, 64, 0, 0, 0, 65, 0, 0, 0, 65, 8, 23, 0, 0, 200, 25, 0, 0, 132, 28, 0, 0, 60, 31, 0, 0, 240, 33, 0, 0, 160, 36, 0, 0, 76, 39, 0, 0, 180, 40, 0, 0, 112, 41, 0, 0, 228, 41, 0, 0, 48, 42, 0, 0, 104, 42, 0, 0, 136, 42, 0, 0, 160, 42, 0, 0, 172, 42, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 7, 0, 0, 0, 9, 0, 0, 0, 11, 0, 0, 0, 13, 0, 0, 0, 15, 0, 0, 0, 17, 0, 0, 0, 19, 0, 0, 0, 21, 0, 0, 0, 23, 0, 0, 0, 25, 0, 0, 0, 27, 0, 0, 0, 29, 0, 0, 0, 31, 0, 0, 0, 33, 0, 0, 0, 35, 0, 0, 0, 37, 0, 0, 0, 39, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 49, 0, 0, 0, 51, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0, 57, 0, 0, 0, 59, 0, 0, 0, 61, 0, 0, 0, 63, 0, 0, 0, 65, 0, 0, 0, 67, 0, 0, 0, 69, 0, 0, 0, 71, 0, 0, 0, 73, 0, 0, 0, 75, 0, 0, 0, 77, 0, 0, 0, 79, 0, 0, 0, 81, 0, 0, 0, 83, 0, 0, 0, 85, 0, 0, 0, 87, 0, 0, 0, 89, 0, 0, 0, 91, 0, 0, 0, 93, 0, 0, 0, 95, 0, 0, 0, 97, 0, 0, 0, 99, 0, 0, 0, 101, 0, 0, 0, 103, 0, 0, 0, 105, 0, 0, 0, 107, 0, 0, 0, 109, 0, 0, 0, 111, 0, 0, 0, 113, 0, 0, 0, 115, 0, 0, 0, 117, 0, 0, 0, 119, 0, 0, 0, 121, 0, 0, 0, 123, 0, 0, 0, 125, 0, 0, 0, 127, 0, 0, 0, 129, 0, 0, 0, 131, 0, 0, 0, 133, 0, 0, 0, 135, 0, 0, 0, 137, 0, 0, 0, 139, 0, 0, 0, 141, 0, 0, 0, 143, 0, 0, 0, 145, 0, 0, 0, 147, 0, 0, 0, 149, 0, 0, 0, 151, 0, 0, 0, 153, 0, 0, 0, 155, 0, 0, 0, 157, 0, 0, 0, 159, 0, 0, 0, 161, 0, 0, 0, 163, 0, 0, 0, 165, 0, 0, 0, 167, 0, 0, 0, 169, 0, 0, 0, 171, 0, 0, 0, 173, 0, 0, 0, 175, 0, 0, 0, 177, 0, 0, 0, 179, 0, 0, 0, 181, 0, 0, 0, 183, 0, 0, 0, 185, 0, 0, 0, 187, 0, 0, 0, 189, 0, 0, 0, 191, 0, 0, 0, 193, 0, 0, 0, 195, 0, 0, 0, 197, 0, 0, 0, 199, 0, 0, 0, 201, 0, 0, 0, 203, 0, 0, 0, 205, 0, 0, 0, 207, 0, 0, 0, 209, 0, 0, 0, 211, 0, 0, 0, 213, 0, 0, 0, 215, 0, 0, 0, 217, 0, 0, 0, 219, 0, 0, 0, 221, 0, 0, 0, 223, 0, 0, 0, 225, 0, 0, 0, 227, 0, 0, 0, 229, 0, 0, 0, 231, 0, 0, 0, 233, 0, 0, 0, 235, 0, 0, 0, 237, 0, 0, 0, 239, 0, 0, 0, 241, 0, 0, 0, 243, 0, 0, 0, 245, 0, 0, 0, 247, 0, 0, 0, 249, 0, 0, 0, 251, 0, 0, 0, 253, 0, 0, 0, 255, 0, 0, 0, 1, 1, 0, 0, 3, 1, 0, 0, 5, 1, 0, 0, 7, 1, 0, 0, 9, 1, 0, 0, 11, 1, 0, 0, 13, 1, 0, 0, 15, 1, 0, 0, 17, 1, 0, 0, 19, 1, 0, 0, 21, 1, 0, 0, 23, 1, 0, 0, 25, 1, 0, 0, 27, 1, 0, 0, 29, 1, 0, 0, 31, 1, 0, 0, 33, 1, 0, 0, 35, 1, 0, 0, 37, 1, 0, 0, 39, 1, 0, 0, 41, 1, 0, 0, 43, 1, 0, 0, 45, 1, 0, 0, 47, 1, 0, 0, 49, 1, 0, 0, 51, 1, 0, 0, 53, 1, 0, 0, 55, 1, 0, 0, 57, 1, 0, 0, 59, 1, 0, 0, 61, 1, 0, 0, 63, 1, 0, 0, 65, 1, 0, 0, 67, 1, 0, 0, 69, 1, 0, 0, 71, 1, 0, 0, 73, 1, 0, 0, 75, 1, 0, 0, 77, 1, 0, 0, 79, 1, 0, 0, 81, 1, 0, 0, 83, 1, 0, 0, 85, 1, 0, 0, 87, 1, 0, 0, 89, 1, 0, 0, 91, 1, 0, 0, 93, 1, 0, 0, 95, 1, 0, 0, 13, 0, 0, 0, 25, 0, 0, 0, 41, 0, 0, 0, 61, 0, 0, 0, 85, 0, 0, 0, 113, 0, 0, 0, 145, 0, 0, 0, 181, 0, 0, 0, 221, 0, 0, 0, 9, 1, 0, 0, 57, 1, 0, 0, 109, 1, 0, 0, 165, 1, 0, 0, 225, 1, 0, 0, 33, 2, 0, 0, 101, 2, 0, 0, 173, 2, 0, 0, 249, 2, 0, 0, 73, 3, 0, 0, 157, 3, 0, 0, 245, 3, 0, 0, 81, 4, 0, 0, 177, 4, 0, 0, 21, 5, 0, 0, 125, 5, 0, 0, 233, 5, 0, 0, 89, 6, 0, 0, 205, 6, 0, 0, 69, 7, 0, 0, 193, 7, 0, 0, 65, 8, 0, 0, 197, 8, 0, 0, 77, 9, 0, 0, 217, 9, 0, 0, 105, 10, 0, 0, 253, 10, 0, 0, 149, 11, 0, 0, 49, 12, 0, 0, 209, 12, 0, 0, 117, 13, 0, 0, 29, 14, 0, 0, 201, 14, 0, 0, 121, 15, 0, 0, 45, 16, 0, 0, 229, 16, 0, 0, 161, 17, 0, 0, 97, 18, 0, 0, 37, 19, 0, 0, 237, 19, 0, 0, 185, 20, 0, 0, 137, 21, 0, 0, 93, 22, 0, 0, 53, 23, 0, 0, 17, 24, 0, 0, 241, 24, 0, 0, 213, 25, 0, 0, 189, 26, 0, 0, 169, 27, 0, 0, 153, 28, 0, 0, 141, 29, 0, 0, 133, 30, 0, 0, 129, 31, 0, 0, 129, 32, 0, 0, 133, 33, 0, 0, 141, 34, 0, 0, 153, 35, 0, 0, 169, 36, 0, 0, 189, 37, 0, 0, 213, 38, 0, 0, 241, 39, 0, 0, 17, 41, 0, 0, 53, 42, 0, 0, 93, 43, 0, 0, 137, 44, 0, 0, 185, 45, 0, 0, 237, 46, 0, 0, 37, 48, 0, 0, 97, 49, 0, 0, 161, 50, 0, 0, 229, 51, 0, 0, 45, 53, 0, 0, 121, 54, 0, 0, 201, 55, 0, 0, 29, 57, 0, 0, 117, 58, 0, 0, 209, 59, 0, 0, 49, 61, 0, 0, 149, 62, 0, 0, 253, 63, 0, 0, 105, 65, 0, 0, 217, 66, 0, 0, 77, 68, 0, 0, 197, 69, 0, 0, 65, 71, 0, 0, 193, 72, 0, 0, 69, 74, 0, 0, 205, 75, 0, 0, 89, 77, 0, 0, 233, 78, 0, 0, 125, 80, 0, 0, 21, 82, 0, 0, 177, 83, 0, 0, 81, 85, 0, 0, 245, 86, 0, 0, 157, 88, 0, 0, 73, 90, 0, 0, 249, 91, 0, 0, 173, 93, 0, 0, 101, 95, 0, 0, 33, 97, 0, 0, 225, 98, 0, 0, 165, 100, 0, 0, 109, 102, 0, 0, 57, 104, 0, 0, 9, 106, 0, 0, 221, 107, 0, 0, 181, 109, 0, 0, 145, 111, 0, 0, 113, 113, 0, 0, 85, 115, 0, 0, 61, 117, 0, 0, 41, 119, 0, 0, 25, 121, 0, 0, 13, 123, 0, 0, 5, 125, 0, 0, 1, 127, 0, 0, 1, 129, 0, 0, 5, 131, 0, 0, 13, 133, 0, 0, 25, 135, 0, 0, 41, 137, 0, 0, 61, 139, 0, 0, 85, 141, 0, 0, 113, 143, 0, 0, 145, 145, 0, 0, 181, 147, 0, 0, 221, 149, 0, 0, 9, 152, 0, 0, 57, 154, 0, 0, 109, 156, 0, 0, 165, 158, 0, 0, 225, 160, 0, 0, 33, 163, 0, 0, 101, 165, 0, 0, 173, 167, 0, 0, 249, 169, 0, 0, 73, 172, 0, 0, 157, 174, 0, 0, 245, 176, 0, 0, 81, 179, 0, 0, 177, 181, 0, 0, 21, 184, 0, 0, 125, 186, 0, 0, 233, 188, 0, 0, 89, 191, 0, 0, 205, 193, 0, 0, 69, 196, 0, 0, 193, 198, 0, 0, 65, 201, 0, 0, 197, 203, 0, 0, 77, 206, 0, 0, 217, 208, 0, 0, 105, 211, 0, 0, 253, 213, 0, 0, 149, 216, 0, 0, 49, 219, 0, 0, 209, 221, 0, 0, 117, 224, 0, 0, 29, 227, 0, 0, 201, 229, 0, 0, 121, 232, 0, 0, 45, 235, 0, 0, 229, 237, 0, 0, 161, 240, 0, 0, 63, 0, 0, 0, 129, 0, 0, 0, 231, 0, 0, 0, 121, 1, 0, 0, 63, 2, 0, 0, 65, 3, 0, 0, 135, 4, 0, 0, 25, 6, 0, 0, 255, 7, 0, 0, 65, 10, 0, 0, 231, 12, 0, 0, 249, 15, 0, 0, 127, 19, 0, 0, 129, 23, 0, 0, 7, 28, 0, 0, 25, 33, 0, 0, 191, 38, 0, 0, 1, 45, 0, 0, 231, 51, 0, 0, 121, 59, 0, 0, 191, 67, 0, 0, 193, 76, 0, 0, 135, 86, 0, 0, 25, 97, 0, 0, 127, 108, 0, 0, 193, 120, 0, 0, 231, 133, 0, 0, 249, 147, 0, 0, 255, 162, 0, 0, 1, 179, 0, 0, 7, 196, 0, 0, 25, 214, 0, 0, 63, 233, 0, 0, 129, 253, 0, 0, 231, 18, 1, 0, 121, 41, 1, 0, 63, 65, 1, 0, 65, 90, 1, 0, 135, 116, 1, 0, 25, 144, 1, 0, 255, 172, 1, 0, 65, 203, 1, 0, 231, 234, 1, 0, 249, 11, 2, 0, 127, 46, 2, 0, 129, 82, 2, 0, 7, 120, 2, 0, 25, 159, 2, 0, 191, 199, 2, 0, 1, 242, 2, 0, 231, 29, 3, 0, 121, 75, 3, 0, 191, 122, 3, 0, 193, 171, 3, 0, 135, 222, 3, 0, 25, 19, 4, 0, 127, 73, 4, 0, 193, 129, 4, 0, 231, 187, 4, 0, 249, 247, 4, 0, 255, 53, 5, 0, 1, 118, 5, 0, 7, 184, 5, 0, 25, 252, 5, 0, 63, 66, 6, 0, 129, 138, 6, 0, 231, 212, 6, 0, 121, 33, 7, 0, 63, 112, 7, 0, 65, 193, 7, 0, 135, 20, 8, 0, 25, 106, 8, 0, 255, 193, 8, 0, 65, 28, 9, 0, 231, 120, 9, 0, 249, 215, 9, 0, 127, 57, 10, 0, 129, 157, 10, 0, 7, 4, 11, 0, 25, 109, 11, 0, 191, 216, 11, 0, 1, 71, 12, 0, 231, 183, 12, 0, 121, 43, 13, 0, 191, 161, 13, 0, 193, 26, 14, 0, 135, 150, 14, 0, 25, 21, 15, 0, 127, 150, 15, 0, 193, 26, 16, 0, 231, 161, 16, 0, 249, 43, 17, 0, 255, 184, 17, 0, 1, 73, 18, 0, 7, 220, 18, 0, 25, 114, 19, 0, 63, 11, 20, 0, 129, 167, 20, 0, 231, 70, 21, 0, 121, 233, 21, 0, 63, 143, 22, 0, 65, 56, 23, 0, 135, 228, 23, 0, 25, 148, 24, 0, 255, 70, 25, 0, 65, 253, 25, 0, 231, 182, 26, 0, 249, 115, 27, 0, 127, 52, 28, 0, 129, 248, 28, 0, 7, 192, 29, 0, 25, 139, 30, 0, 191, 89, 31, 0, 1, 44, 32, 0, 231, 1, 33, 0, 121, 219, 33, 0, 191, 184, 34, 0, 193, 153, 35, 0, 135, 126, 36, 0, 25, 103, 37, 0, 127, 83, 38, 0, 193, 67, 39, 0, 231, 55, 40, 0, 249, 47, 41, 0, 255, 43, 42, 0, 1, 44, 43, 0, 7, 48, 44, 0, 25, 56, 45, 0, 63, 68, 46, 0, 129, 84, 47, 0, 231, 104, 48, 0, 121, 129, 49, 0, 63, 158, 50, 0, 65, 191, 51, 0, 135, 228, 52, 0, 25, 14, 54, 0, 255, 59, 55, 0, 65, 110, 56, 0, 231, 164, 57, 0, 249, 223, 58, 0, 127, 31, 60, 0, 129, 99, 61, 0, 7, 172, 62, 0, 25, 249, 63, 0, 191, 74, 65, 0, 1, 161, 66, 0, 231, 251, 67, 0, 121, 91, 69, 0, 191, 191, 70, 0, 193, 40, 72, 0, 135, 150, 73, 0, 25, 9, 75, 0, 127, 128, 76, 0, 193, 252, 77, 0, 231, 125, 79, 0, 249, 3, 81, 0, 255, 142, 82, 0, 1, 31, 84, 0, 7, 180, 85, 0, 25, 78, 87, 0, 63, 237, 88, 0, 129, 145, 90, 0, 231, 58, 92, 0, 121, 233, 93, 0, 63, 157, 95, 0, 65, 86, 97, 0, 135, 20, 99, 0, 25, 216, 100, 0, 255, 160, 102, 0, 65, 111, 104, 0, 231, 66, 106, 0, 249, 27, 108, 0, 127, 250, 109, 0, 65, 1, 0, 0, 169, 2, 0, 0, 9, 5, 0, 0, 193, 8, 0, 0, 65, 14, 0, 0, 9, 22, 0, 0, 169, 32, 0, 0, 193, 46, 0, 0, 1, 65, 0, 0, 41, 88, 0, 0, 9, 117, 0, 0, 129, 152, 0, 0, 129, 195, 0, 0, 9, 247, 0, 0, 41, 52, 1, 0, 1, 124, 1, 0, 193, 207, 1, 0, 169, 48, 2, 0, 9, 160, 2, 0, 65, 31, 3, 0, 193, 175, 3, 0, 9, 83, 4, 0, 169, 10, 5, 0, 65, 216, 5, 0, 129, 189, 6, 0, 41, 188, 7, 0, 9, 214, 8, 0, 1, 13, 10, 0, 1, 99, 11, 0, 9, 218, 12, 0, 41, 116, 14, 0, 129, 51, 16, 0, 65, 26, 18, 0, 169, 42, 20, 0, 9, 103, 22, 0, 193, 209, 24, 0, 65, 109, 27, 0, 9, 60, 30, 0, 169, 64, 33, 0, 193, 125, 36, 0, 1, 246, 39, 0, 41, 172, 43, 0, 9, 163, 47, 0, 129, 221, 51, 0, 129, 94, 56, 0, 9, 41, 61, 0, 41, 64, 66, 0, 1, 167, 71, 0, 193, 96, 77, 0, 169, 112, 83, 0, 9, 218, 89, 0, 65, 160, 96, 0, 193, 198, 103, 0, 9, 81, 111, 0, 169, 66, 119, 0, 65, 159, 127, 0, 129, 106, 136, 0, 41, 168, 145, 0, 9, 92, 155, 0, 1, 138, 165, 0, 1, 54, 176, 0, 9, 100, 187, 0, 41, 24, 199, 0, 129, 86, 211, 0, 65, 35, 224, 0, 169, 130, 237, 0, 9, 121, 251, 0, 193, 10, 10, 1, 65, 60, 25, 1, 9, 18, 41, 1, 169, 144, 57, 1, 193, 188, 74, 1, 1, 155, 92, 1, 41, 48, 111, 1, 9, 129, 130, 1, 129, 146, 150, 1, 129, 105, 171, 1, 9, 11, 193, 1, 41, 124, 215, 1, 1, 194, 238, 1, 193, 225, 6, 2, 169, 224, 31, 2, 9, 196, 57, 2, 65, 145, 84, 2, 193, 77, 112, 2, 9, 255, 140, 2, 169, 170, 170, 2, 65, 86, 201, 2, 129, 7, 233, 2, 41, 196, 9, 3, 9, 146, 43, 3, 1, 119, 78, 3, 1, 121, 114, 3, 9, 158, 151, 3, 41, 236, 189, 3, 129, 105, 229, 3, 65, 28, 14, 4, 169, 10, 56, 4, 9, 59, 99, 4, 193, 179, 143, 4, 65, 123, 189, 4, 9, 152, 236, 4, 169, 16, 29, 5, 193, 235, 78, 5, 1, 48, 130, 5, 41, 228, 182, 5, 9, 15, 237, 5, 129, 183, 36, 6, 129, 228, 93, 6, 9, 157, 152, 6, 41, 232, 212, 6, 1, 205, 18, 7, 193, 82, 82, 7, 169, 128, 147, 7, 9, 94, 214, 7, 65, 242, 26, 8, 193, 68, 97, 8, 9, 93, 169, 8, 169, 66, 243, 8, 65, 253, 62, 9, 129, 148, 140, 9, 41, 16, 220, 9, 9, 120, 45, 10, 1, 212, 128, 10, 1, 44, 214, 10, 9, 136, 45, 11, 41, 240, 134, 11, 129, 108, 226, 11, 65, 5, 64, 12, 169, 194, 159, 12, 9, 173, 1, 13, 193, 204, 101, 13, 65, 42, 204, 13, 9, 206, 52, 14, 169, 192, 159, 14, 193, 10, 13, 15, 1, 181, 124, 15, 41, 200, 238, 15, 9, 77, 99, 16, 129, 76, 218, 16, 129, 207, 83, 17, 9, 223, 207, 17, 41, 132, 78, 18, 1, 200, 207, 18, 193, 179, 83, 19, 169, 80, 218, 19, 9, 168, 99, 20, 65, 195, 239, 20, 193, 171, 126, 21, 9, 107, 16, 22, 169, 10, 165, 22, 65, 148, 60, 23, 129, 17, 215, 23, 41, 140, 116, 24, 9, 14, 21, 25, 1, 161, 184, 25, 1, 79, 95, 26, 9, 34, 9, 27, 41, 36, 182, 27, 129, 95, 102, 28, 65, 222, 25, 29, 169, 170, 208, 29, 9, 207, 138, 30, 193, 85, 72, 31, 65, 73, 9, 32, 9, 180, 205, 32, 169, 160, 149, 33, 193, 25, 97, 34, 1, 42, 48, 35, 41, 220, 2, 36, 9, 59, 217, 36, 129, 81, 179, 37, 147, 6, 0, 0, 69, 14, 0, 0, 15, 28, 0, 0, 17, 51, 0, 0, 91, 87, 0, 0, 13, 142, 0, 0, 119, 221, 0, 0, 57, 77, 1, 0, 99, 230, 1, 0, 149, 179, 2, 0, 31, 193, 3, 0, 33, 29, 5, 0, 171, 215, 6, 0, 221, 2, 9, 0, 7, 179, 11, 0, 201, 254, 14, 0, 51, 255, 18, 0, 229, 207, 23, 0, 47, 143, 29, 0, 49, 94, 36, 0, 251, 96, 44, 0, 173, 190, 53, 0, 151, 161, 64, 0, 89, 55, 77, 0, 3, 177, 91, 0, 53, 67, 108, 0, 63, 38, 127, 0, 65, 150, 148, 0, 75, 211, 172, 0, 125, 33, 200, 0, 39, 201, 230, 0, 233, 22, 9, 1, 211, 91, 47, 1, 133, 237, 89, 1, 79, 38, 137, 1, 81, 101, 189, 1, 155, 14, 247, 1, 77, 139, 54, 2, 183, 73, 124, 2, 121, 189, 200, 2, 163, 95, 28, 3], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
allocate([213, 174, 119, 3, 95, 47, 219, 3, 97, 107, 71, 4, 235, 242, 188, 4, 29, 92, 60, 5, 71, 67, 198, 5, 9, 75, 91, 6, 115, 28, 252, 6, 37, 103, 169, 7, 111, 225, 99, 8, 113, 72, 44, 9, 59, 96, 3, 10, 237, 243, 233, 10, 215, 213, 224, 11, 153, 223, 232, 12, 67, 242, 2, 14, 117, 246, 47, 15, 127, 220, 112, 16, 129, 156, 198, 17, 139, 54, 50, 19, 189, 178, 180, 20, 103, 33, 79, 22, 41, 155, 2, 24, 19, 65, 208, 25, 197, 60, 185, 27, 143, 192, 190, 29, 145, 7, 226, 31, 219, 85, 36, 34, 141, 248, 134, 36, 247, 69, 11, 39, 185, 157, 178, 41, 227, 104, 126, 44, 21, 26, 112, 47, 159, 45, 137, 50, 161, 41, 203, 53, 43, 158, 55, 57, 93, 37, 208, 60, 135, 99, 150, 64, 73, 7, 140, 68, 179, 201, 178, 72, 101, 110, 12, 77, 175, 195, 154, 81, 177, 162, 95, 86, 123, 239, 92, 91, 45, 153, 148, 96, 23, 154, 8, 102, 217, 247, 186, 107, 131, 195, 173, 113, 181, 25, 227, 119, 191, 34, 93, 126, 29, 35, 0, 0, 113, 77, 0, 0, 145, 156, 0, 0, 253, 38, 1, 0, 101, 12, 2, 0, 233, 119, 3, 0, 153, 162, 5, 0, 53, 214, 8, 0, 45, 112, 13, 0, 225, 228, 19, 0, 33, 195, 28, 0, 237, 183, 40, 0, 117, 146, 56, 0, 89, 72, 77, 0, 41, 250, 103, 0, 37, 248, 137, 0, 61, 199, 180, 0, 81, 38, 234, 0, 177, 19, 44, 1, 221, 210, 124, 1, 133, 242, 222, 1, 201, 82, 85, 2, 185, 43, 227, 2, 21, 20, 140, 3, 77, 8, 84, 4, 193, 113, 63, 5, 65, 46, 83, 6, 205, 151, 148, 7, 149, 140, 9, 9, 57, 119, 184, 10, 73, 87, 168, 12, 5, 202, 224, 14, 93, 19, 106, 17, 49, 39, 77, 20, 209, 178, 147, 23, 189, 38, 72, 27, 165, 192, 117, 31, 169, 149, 40, 36, 217, 156, 109, 41, 245, 185, 82, 47, 109, 200, 230, 53, 161, 166, 57, 61, 97, 65, 92, 69, 173, 159, 96, 78, 181, 238, 89, 88, 25, 142, 92, 99, 105, 28, 126, 111, 229, 131, 213, 124, 255, 189, 0, 0, 1, 168, 1, 0, 143, 107, 3, 0, 241, 158, 6, 0, 63, 35, 12, 0, 193, 61, 21, 0, 143, 182, 35, 0, 241, 252, 57, 0, 255, 81, 91, 0, 1, 250, 139, 0, 15, 117, 209, 0, 113, 191, 50, 1, 63, 154, 184, 1, 193, 220, 109, 2, 15, 207, 95, 3, 113, 142, 158, 4, 255, 123, 61, 6, 1, 182, 83, 8, 143, 156, 252, 10, 241, 97, 88, 14, 63, 167, 140, 18, 193, 37, 197, 23, 143, 101, 52, 30, 241, 129, 20, 38, 255, 251, 167, 47, 1, 156, 58, 59, 15, 98, 34, 73, 113, 134, 192, 89, 63, 138, 130, 109, 193, 88, 227, 132, 1, 14, 4, 0, 145, 33, 9, 0, 17, 44, 19, 0, 65, 238, 37, 0, 65, 79, 71, 0, 145, 67, 128, 0, 17, 247, 221, 0, 1, 70, 115, 1, 1, 146, 90, 2, 17, 1, 184, 3, 145, 53, 188, 5, 65, 143, 167, 8, 65, 6, 206, 12, 17, 178, 155, 18, 145, 15, 154, 26, 1, 26, 118, 37, 1, 76, 7, 52, 145, 158, 87, 71, 17, 157, 172, 96, 65, 166, 145, 129, 35, 81, 22, 0, 197, 158, 50, 0, 23, 185, 107, 0, 153, 246, 216, 0, 107, 137, 160, 1, 13, 196, 254, 2, 31, 1, 80, 5, 33, 217, 29, 9, 51, 108, 48, 15, 213, 162, 164, 24, 167, 103, 8, 39, 41, 253, 125, 60, 123, 181, 231, 91, 29, 119, 29, 137, 175, 160, 45, 201, 173, 142, 123, 0, 137, 230, 25, 1, 57, 150, 94, 2, 61, 22, 216, 4, 181, 99, 119, 9, 225, 40, 198, 17, 33, 3, 52, 32, 117, 72, 130, 56, 125, 87, 87, 96, 191, 91, 175, 2, 129, 216, 39, 6, 247, 132, 94, 13, 233, 254, 173, 27, 127, 139, 235, 54, 129, 183, 229, 104, 23, 3, 156, 193, 193, 12, 255, 14, 57, 106, 133, 34, 25, 238, 145, 75, 129, 120, 43, 158, 51, 225, 9, 84, 149, 139, 0, 0, 55, 152, 0, 0, 255, 165, 0, 0, 4, 181, 0, 0, 103, 197, 0, 0, 69, 215, 0, 0, 193, 234, 0, 0, 255, 255, 0, 0, 12, 43, 0, 0, 128, 187, 0, 0, 120, 0, 0, 0, 21, 0, 0, 0, 21, 0, 0, 0, 0, 154, 89, 63, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 128, 63, 128, 111, 0, 0, 3, 0, 0, 0, 8, 0, 0, 0, 120, 0, 0, 0, 11, 0, 0, 0, 92, 123, 0, 0, 172, 111, 0, 0, 120, 43, 0, 0, 128, 7, 0, 0, 3, 0, 0, 0, 88, 45, 0, 0, 140, 45, 0, 0, 192, 45, 0, 0, 244, 45, 0, 0, 40, 46, 0, 0, 136, 1, 0, 0, 214, 111, 0, 0, 67, 124, 0, 0, 203, 125, 0, 0, 106, 28, 141, 56, 82, 187, 30, 58, 8, 105, 220, 58, 130, 237, 87, 59, 137, 99, 178, 59, 3, 42, 5, 60, 48, 220, 57, 60, 180, 62, 119, 60, 28, 163, 158, 60, 209, 242, 197, 60, 254, 134, 241, 60, 155, 171, 16, 61, 5, 173, 42, 61, 132, 194, 70, 61, 83, 230, 100, 61, 17, 137, 130, 61, 135, 159, 147, 61, 203, 178, 165, 61, 209, 190, 184, 61, 58, 191, 204, 61, 84, 175, 225, 61, 20, 138, 247, 61, 14, 37, 7, 62, 217, 244, 18, 62, 95, 49, 31, 62, 104, 215, 43, 62, 138, 227, 56, 62, 48, 82, 70, 62, 148, 31, 84, 62, 191, 71, 98, 62, 142, 198, 112, 62, 176, 151, 127, 62, 82, 91, 135, 62, 96, 15, 143, 62, 152, 229, 150, 62, 121, 219, 158, 62, 112, 238, 166, 62, 216, 27, 175, 62, 251, 96, 183, 62, 17, 187, 191, 62, 70, 39, 200, 62, 183, 162, 208, 62, 120, 42, 217, 62, 148, 187, 225, 62, 12, 83, 234, 62, 222, 237, 242, 62, 6, 137, 251, 62, 190, 16, 2, 63, 31, 90, 6, 63, 36, 159, 10, 63, 80, 222, 14, 63, 43, 22, 19, 63, 65, 69, 23, 63, 37, 106, 27, 63, 115, 131, 31, 63, 206, 143, 35, 63, 230, 141, 39, 63, 116, 124, 43, 63, 63, 90, 47, 63, 25, 38, 51, 63, 231, 222, 54, 63, 153, 131, 58, 63, 51, 19, 62, 63, 197, 140, 65, 63, 119, 239, 68, 63, 127, 58, 72, 63, 39, 109, 75, 63, 206, 134, 78, 63, 229, 134, 81, 63, 241, 108, 84, 63, 142, 56, 87, 63, 105, 233, 89, 63, 69, 127, 92, 63, 250, 249, 94, 63, 115, 89, 97, 63, 175, 157, 99, 63, 193, 198, 101, 63, 207, 212, 103, 63, 17, 200, 105, 63, 210, 160, 107, 63, 110, 95, 109, 63, 80, 4, 111, 63, 244, 143, 112, 63, 230, 2, 114, 63, 189, 93, 115, 63, 31, 161, 116, 63, 191, 205, 117, 63, 87, 228, 118, 63, 176, 229, 119, 63, 151, 210, 120, 63, 227, 171, 121, 63, 115, 114, 122, 63, 39, 39, 123, 63, 231, 202, 123, 63, 157, 94, 124, 63, 53, 227, 124, 63, 156, 89, 125, 63, 189, 194, 125, 63, 134, 31, 126, 63, 222, 112, 126, 63, 171, 183, 126, 63, 207, 244, 126, 63, 38, 41, 127, 63, 134, 85, 127, 63, 190, 122, 127, 63, 150, 153, 127, 63, 204, 178, 127, 63, 20, 199, 127, 63, 28, 215, 127, 63, 130, 227, 127, 63, 221, 236, 127, 63, 182, 243, 127, 63, 138, 248, 127, 63, 200, 251, 127, 63, 214, 253, 127, 63, 7, 255, 127, 63, 165, 255, 127, 63, 232, 255, 127, 63, 253, 255, 127, 63, 0, 0, 128, 63, 224, 1, 0, 0, 135, 136, 8, 59, 255, 255, 255, 255, 5, 0, 96, 0, 3, 0, 32, 0, 4, 0, 8, 0, 2, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 115, 0, 0, 72, 74, 0, 0, 240, 0, 0, 0, 137, 136, 136, 59, 1, 0, 0, 0, 5, 0, 48, 0, 3, 0, 16, 0, 4, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 114, 0, 0, 72, 74, 0, 0, 120, 0, 0, 0, 136, 136, 8, 60, 2, 0, 0, 0, 5, 0, 24, 0, 3, 0, 8, 0, 2, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 113, 0, 0, 72, 74, 0, 0, 60, 0, 0, 0, 137, 136, 136, 60, 3, 0, 0, 0, 5, 0, 12, 0, 3, 0, 4, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 168, 112, 0, 0, 72, 74, 0, 0, 255, 255, 127, 63, 142, 255, 127, 63, 106, 254, 127, 63, 147, 252, 127, 63, 7, 250, 127, 63, 200, 246, 127, 63, 214, 242, 127, 63, 48, 238, 127, 63, 214, 232, 127, 63, 200, 226, 127, 63, 7, 220, 127, 63, 147, 212, 127, 63, 107, 204, 127, 63, 143, 195, 127, 63, 0, 186, 127, 63, 189, 175, 127, 63, 199, 164, 127, 63, 29, 153, 127, 63, 192, 140, 127, 63, 176, 127, 127, 63, 236, 113, 127, 63, 118, 99, 127, 63, 75, 84, 127, 63, 110, 68, 127, 63, 222, 51, 127, 63, 154, 34, 127, 63, 163, 16, 127, 63, 250, 253, 126, 63, 157, 234, 126, 63, 141, 214, 126, 63, 203, 193, 126, 63, 86, 172, 126, 63, 46, 150, 126, 63, 83, 127, 126, 63, 198, 103, 126, 63, 134, 79, 126, 63, 148, 54, 126, 63, 239, 28, 126, 63, 152, 2, 126, 63, 143, 231, 125, 63, 211, 203, 125, 63, 102, 175, 125, 63, 70, 146, 125, 63, 116, 116, 125, 63, 241, 85, 125, 63, 188, 54, 125, 63, 213, 22, 125, 63, 60, 246, 124, 63, 242, 212, 124, 63, 246, 178, 124, 63, 73, 144, 124, 63, 235, 108, 124, 63, 219, 72, 124, 63, 27, 36, 124, 63, 169, 254, 123, 63, 135, 216, 123, 63, 180, 177, 123, 63, 48, 138, 123, 63, 252, 97, 123, 63, 23, 57, 123, 63, 130, 15, 123, 63, 61, 229, 122, 63, 72, 186, 122, 63, 162, 142, 122, 63, 77, 98, 122, 63, 72, 53, 122, 63, 148, 7, 122, 63, 48, 217, 121, 63, 29, 170, 121, 63, 90, 122, 121, 63, 233, 73, 121, 63, 200, 24, 121, 63, 249, 230, 120, 63, 123, 180, 120, 63, 78, 129, 120, 63, 115, 77, 120, 63, 234, 24, 120, 63, 178, 227, 119, 63, 205, 173, 119, 63, 58, 119, 119, 63, 249, 63, 119, 63, 10, 8, 119, 63, 110, 207, 118, 63, 37, 150, 118, 63, 47, 92, 118, 63, 140, 33, 118, 63, 60, 230, 117, 63, 64, 170, 117, 63, 151, 109, 117, 63, 66, 48, 117, 63, 65, 242, 116, 63, 148, 179, 116, 63, 59, 116, 116, 63, 55, 52, 116, 63, 135, 243, 115, 63, 44, 178, 115, 63, 38, 112, 115, 63, 118, 45, 115, 63, 26, 234, 114, 63, 20, 166, 114, 63, 100, 97, 114, 63, 10, 28, 114, 63, 5, 214, 113, 63, 87, 143, 113, 63, 0, 72, 113, 63, 255, 255, 112, 63, 85, 183, 112, 63, 2, 110, 112, 63, 6, 36, 112, 63, 98, 217, 111, 63, 21, 142, 111, 63, 32, 66, 111, 63, 132, 245, 110, 63, 63, 168, 110, 63, 83, 90, 110, 63, 192, 11, 110, 63, 134, 188, 109, 63, 165, 108, 109, 63, 29, 28, 109, 63, 239, 202, 108, 63, 27, 121, 108, 63, 161, 38, 108, 63, 128, 211, 107, 63, 187, 127, 107, 63, 80, 43, 107, 63, 64, 214, 106, 63, 140, 128, 106, 63, 50, 42, 106, 63, 53, 211, 105, 63, 147, 123, 105, 63, 77, 35, 105, 63, 100, 202, 104, 63, 216, 112, 104, 63, 168, 22, 104, 63, 213, 187, 103, 63, 96, 96, 103, 63, 72, 4, 103, 63, 143, 167, 102, 63, 51, 74, 102, 63, 54, 236, 101, 63, 151, 141, 101, 63, 87, 46, 101, 63, 119, 206, 100, 63, 245, 109, 100, 63, 212, 12, 100, 63, 18, 171, 99, 63, 177, 72, 99, 63, 176, 229, 98, 63, 16, 130, 98, 63, 209, 29, 98, 63, 243, 184, 97, 63, 119, 83, 97, 63, 92, 237, 96, 63, 164, 134, 96, 63, 78, 31, 96, 63, 91, 183, 95, 63, 203, 78, 95, 63, 158, 229, 94, 63, 213, 123, 94, 63, 112, 17, 94, 63, 110, 166, 93, 63, 210, 58, 93, 63, 154, 206, 92, 63, 198, 97, 92, 63, 89, 244, 91, 63, 81, 134, 91, 63, 174, 23, 91, 63, 114, 168, 90, 63, 157, 56, 90, 63, 46, 200, 89, 63, 39, 87, 89, 63, 135, 229, 88, 63, 79, 115, 88, 63, 127, 0, 88, 63, 23, 141, 87, 63, 24, 25, 87, 63, 130, 164, 86, 63, 86, 47, 86, 63, 147, 185, 85, 63, 58, 67, 85, 63, 75, 204, 84, 63, 199, 84, 84, 63, 174, 220, 83, 63, 1, 100, 83, 63, 191, 234, 82, 63, 233, 112, 82, 63, 127, 246, 81, 63, 130, 123, 81, 63, 242, 255, 80, 63, 207, 131, 80, 63, 26, 7, 80, 63, 210, 137, 79, 63, 250, 11, 79, 63, 144, 141, 78, 63, 148, 14, 78, 63, 9, 143, 77, 63, 237, 14, 77, 63, 65, 142, 76, 63, 5, 13, 76, 63, 59, 139, 75, 63, 225, 8, 75, 63, 249, 133, 74, 63, 131, 2, 74, 63, 127, 126, 73, 63, 238, 249, 72, 63, 207, 116, 72, 63, 36, 239, 71, 63, 237, 104, 71, 63, 41, 226, 70, 63, 218, 90, 70, 63, 0, 211, 69, 63, 155, 74, 69, 63, 172, 193, 68, 63, 50, 56, 68, 63, 47, 174, 67, 63, 162, 35, 67, 63, 141, 152, 66, 63, 239, 12, 66, 63, 200, 128, 65, 63, 26, 244, 64, 63, 229, 102, 64, 63, 40, 217, 63, 63, 229, 74, 63, 63, 27, 188, 62, 63, 204, 44, 62, 63, 247, 156, 61, 63, 157, 12, 61, 63, 190, 123, 60, 63, 92, 234, 59, 63, 117, 88, 59, 63, 10, 198, 58, 63, 29, 51, 58, 63, 173, 159, 57, 63, 187, 11, 57, 63, 71, 119, 56, 63, 81, 226, 55, 63, 218, 76, 55, 63, 227, 182, 54, 63, 107, 32, 54, 63, 116, 137, 53, 63, 253, 241, 52, 63, 7, 90, 52, 63, 147, 193, 51, 63, 160, 40, 51, 63, 48, 143, 50, 63, 66, 245, 49, 63, 216, 90, 49, 63, 241, 191, 48, 63, 142, 36, 48, 63, 175, 136, 47, 63, 85, 236, 46, 63, 129, 79, 46, 63, 50, 178, 45, 63, 105, 20, 45, 63, 39, 118, 44, 63, 107, 215, 43, 63, 55, 56, 43, 63, 139, 152, 42, 63, 103, 248, 41, 63, 204, 87, 41, 63, 186, 182, 40, 63, 50, 21, 40, 63, 51, 115, 39, 63, 191, 208, 38, 63, 214, 45, 38, 63, 121, 138, 37, 63, 167, 230, 36, 63, 97, 66, 36, 63, 169, 157, 35, 63, 125, 248, 34, 63, 223, 82, 34, 63, 207, 172, 33, 63, 77, 6, 33, 63, 91, 95, 32, 63, 248, 183, 31, 63, 37, 16, 31, 63, 226, 103, 30, 63, 48, 191, 29, 63, 16, 22, 29, 63, 129, 108, 28, 63, 132, 194, 27, 63, 26, 24, 27, 63, 67, 109, 26, 63, 0, 194, 25, 63, 81, 22, 25, 63, 54, 106, 24, 63, 177, 189, 23, 63, 193, 16, 23, 63, 103, 99, 22, 63, 163, 181, 21, 63, 118, 7, 21, 63, 225, 88, 20, 63, 228, 169, 19, 63, 127, 250, 18, 63, 179, 74, 18, 63, 128, 154, 17, 63, 231, 233, 16, 63, 232, 56, 16, 63, 132, 135, 15, 63, 187, 213, 14, 63, 142, 35, 14, 63, 254, 112, 13, 63, 10, 190, 12, 63, 179, 10, 12, 63, 250, 86, 11, 63, 223, 162, 10, 63, 99, 238, 9, 63, 134, 57, 9, 63, 73, 132, 8, 63, 172, 206, 7, 63, 175, 24, 7, 63, 84, 98, 6, 63, 155, 171, 5, 63, 131, 244, 4, 63, 15, 61, 4, 63, 61, 133, 3, 63, 15, 205, 2, 63, 134, 20, 2, 63, 161, 91, 1, 63, 97, 162, 0, 63, 143, 209, 255, 62, 167, 93, 254, 62, 14, 233, 252, 62, 194, 115, 251, 62, 198, 253, 249, 62, 27, 135, 248, 62, 193, 15, 247, 62, 186, 151, 245, 62, 6, 31, 244, 62, 168, 165, 242, 62, 158, 43, 241, 62, 236, 176, 239, 62, 145, 53, 238, 62, 144, 185, 236, 62, 232, 60, 235, 62, 154, 191, 233, 62, 169, 65, 232, 62, 21, 195, 230, 62, 223, 67, 229, 62, 8, 196, 227, 62, 145, 67, 226, 62, 124, 194, 224, 62, 200, 64, 223, 62, 120, 190, 221, 62, 140, 59, 220, 62, 6, 184, 218, 62, 230, 51, 217, 62, 46, 175, 215, 62, 223, 41, 214, 62, 249, 163, 212, 62, 125, 29, 211, 62, 110, 150, 209, 62, 204, 14, 208, 62, 151, 134, 206, 62, 210, 253, 204, 62, 125, 116, 203, 62, 153, 234, 201, 62, 39, 96, 200, 62, 40, 213, 198, 62, 159, 73, 197, 62, 138, 189, 195, 62, 236, 48, 194, 62, 198, 163, 192, 62, 25, 22, 191, 62, 230, 135, 189, 62, 45, 249, 187, 62, 241, 105, 186, 62, 50, 218, 184, 62, 241, 73, 183, 62, 47, 185, 181, 62, 238, 39, 180, 62, 47, 150, 178, 62, 242, 3, 177, 62, 57, 113, 175, 62, 4, 222, 173, 62, 86, 74, 172, 62, 47, 182, 170, 62, 144, 33, 169, 62, 122, 140, 167, 62, 239, 246, 165, 62, 239, 96, 164, 62, 124, 202, 162, 62, 151, 51, 161, 62, 64, 156, 159, 62, 122, 4, 158, 62, 68, 108, 156, 62, 161, 211, 154, 62, 145, 58, 153, 62, 22, 161, 151, 62, 48, 7, 150, 62, 225, 108, 148, 62, 41, 210, 146, 62, 11, 55, 145, 62, 135, 155, 143, 62, 158, 255, 141, 62, 81, 99, 140, 62, 162, 198, 138, 62, 145, 41, 137, 62, 32, 140, 135, 62, 80, 238, 133, 62, 34, 80, 132, 62, 151, 177, 130, 62, 176, 18, 129, 62, 222, 230, 126, 62, 169, 167, 123, 62, 195, 103, 120, 62, 47, 39, 117, 62, 238, 229, 113, 62, 4, 164, 110, 62, 115, 97, 107, 62, 60, 30, 104, 62, 98, 218, 100, 62, 232, 149, 97, 62, 207, 80, 94, 62, 26, 11, 91, 62, 204, 196, 87, 62, 230, 125, 84, 62, 107, 54, 81, 62, 93, 238, 77, 62, 191, 165, 74, 62, 146, 92, 71, 62, 218, 18, 68, 62, 151, 200, 64, 62, 206, 125, 61, 62, 128, 50, 58, 62, 174, 230, 54, 62, 93, 154, 51, 62, 141, 77, 48, 62, 66, 0, 45, 62, 125, 178, 41, 62, 66, 100, 38, 62, 145, 21, 35, 62, 110, 198, 31, 62, 219, 118, 28, 62, 218, 38, 25, 62, 109, 214, 21, 62, 152, 133, 18, 62, 91, 52, 15, 62, 186, 226, 11, 62, 183, 144, 8, 62, 84, 62, 5, 62, 148, 235, 1, 62, 240, 48, 253, 61, 6, 138, 246, 61, 113, 226, 239, 61, 51, 58, 233, 61, 79, 145, 226, 61, 207, 231, 219, 61, 181, 61, 213, 61, 3, 147, 206, 61, 192, 231, 199, 61, 242, 59, 193, 61, 156, 143, 186, 61, 195, 226, 179, 61, 108, 53, 173, 61, 155, 135, 166, 61, 85, 217, 159, 61, 159, 42, 153, 61, 126, 123, 146, 61, 246, 203, 139, 61, 11, 28, 133, 61, 135, 215, 124, 61, 70, 118, 111, 61, 93, 20, 98, 61, 214, 177, 84, 61, 185, 78, 71, 61, 16, 235, 57, 61, 229, 134, 44, 61, 64, 34, 31, 61, 44, 189, 17, 61, 178, 87, 4, 61, 181, 227, 237, 60, 96, 23, 211, 60, 118, 74, 184, 60, 11, 125, 157, 60, 50, 175, 130, 60, 250, 193, 79, 60, 254, 36, 26, 60, 42, 15, 201, 59, 153, 167, 59, 59, 46, 125, 214, 185, 210, 70, 113, 187, 171, 222, 227, 187, 166, 140, 39, 188, 129, 41, 93, 188, 225, 98, 137, 188, 160, 48, 164, 188, 236, 253, 190, 188, 179, 202, 217, 188, 224, 150, 244, 188, 49, 177, 7, 189, 147, 22, 21, 189, 140, 123, 34, 189, 19, 224, 47, 189, 30, 68, 61, 189, 165, 167, 74, 189, 157, 10, 88, 189, 254, 108, 101, 189, 190, 206, 114, 189, 234, 23, 128, 189, 27, 200, 134, 189, 237, 119, 141, 189, 92, 39, 148, 189, 99, 214, 154, 189, 253, 132, 161, 189, 38, 51, 168, 189, 217, 224, 174, 189, 17, 142, 181, 189, 202, 58, 188, 189, 254, 230, 194, 189, 170, 146, 201, 189, 200, 61, 208, 189, 84, 232, 214, 189, 74, 146, 221, 189, 164, 59, 228, 189, 93, 228, 234, 189, 114, 140, 241, 189, 221, 51, 248, 189, 154, 218, 254, 189, 82, 192, 2, 190, 252, 18, 6, 190, 71, 101, 9, 190, 50, 183, 12, 190, 186, 8, 16, 190, 221, 89, 19, 190, 152, 170, 22, 190, 234, 250, 25, 190, 208, 74, 29, 190, 71, 154, 32, 190, 78, 233, 35, 190, 225, 55, 39, 190, 0, 134, 42, 190, 166, 211, 45, 190, 211, 32, 49, 190, 131, 109, 52, 190, 181, 185, 55, 190, 101, 5, 59, 190, 147, 80, 62, 190, 58, 155, 65, 190, 90, 229, 68, 190, 240, 46, 72, 190, 249, 119, 75, 190, 116, 192, 78, 190, 93, 8, 82, 190, 179, 79, 85, 190, 115, 150, 88, 190, 156, 220, 91, 190, 42, 34, 95, 190, 27, 103, 98, 190, 109, 171, 101, 190, 31, 239, 104, 190, 44, 50, 108, 190, 148, 116, 111, 190, 84, 182, 114, 190, 106, 247, 117, 190, 211, 55, 121, 190, 141, 119, 124, 190, 150, 182, 127, 190, 117, 122, 129, 190, 69, 25, 131, 190, 185, 183, 132, 190, 208, 85, 134, 190, 136, 243, 135, 190, 225, 144, 137, 190, 218, 45, 139, 190, 112, 202, 140, 190, 164, 102, 142, 190, 116, 2, 144, 190, 223, 157, 145, 190, 228, 56, 147, 190, 129, 211, 148, 190, 182, 109, 150, 190, 129, 7, 152, 190, 226, 160, 153, 190, 215, 57, 155, 190, 95, 210, 156, 190, 121, 106, 158, 190, 35, 2, 160, 190, 94, 153, 161, 190, 38, 48, 163, 190, 125, 198, 164, 190, 96, 92, 166, 190, 206, 241, 167, 190, 198, 134, 169, 190, 71, 27, 171, 190, 80, 175, 172, 190, 224, 66, 174, 190, 245, 213, 175, 190, 143, 104, 177, 190, 173, 250, 178, 190, 77, 140, 180, 190, 110, 29, 182, 190, 16, 174, 183, 190, 48, 62, 185, 190, 207, 205, 186, 190, 234, 92, 188, 190, 130, 235, 189, 190, 148, 121, 191, 190, 31, 7, 193, 190, 35, 148, 194, 190, 159, 32, 196, 190, 145, 172, 197, 190, 248, 55, 199, 190, 211, 194, 200, 190, 34, 77, 202, 190, 226, 214, 203, 190, 19, 96, 205, 190, 181, 232, 206, 190, 197, 112, 208, 190, 66, 248, 209, 190, 45, 127, 211, 190, 131, 5, 213, 190, 67, 139, 214, 190, 109, 16, 216, 190, 255, 148, 217, 190, 249, 24, 219, 190, 89, 156, 220, 190, 29, 31, 222, 190, 70, 161, 223, 190, 211, 34, 225, 190, 193, 163, 226, 190, 16, 36, 228, 190, 190, 163, 229, 190, 204, 34, 231, 190, 56, 161, 232, 190, 0, 31, 234, 190, 36, 156, 235, 190, 162, 24, 237, 190, 122, 148, 238, 190, 171, 15, 240, 190, 51, 138, 241, 190, 18, 4, 243, 190, 70, 125, 244, 190, 207, 245, 245, 190, 170, 109, 247, 190, 217, 228, 248, 190, 88, 91, 250, 190, 40, 209, 251, 190, 71, 70, 253, 190, 181, 186, 254, 190, 56, 23, 0, 191, 187, 208, 0, 191, 228, 137, 1, 191, 178, 66, 2, 191, 37, 251, 2, 191, 59, 179, 3, 191, 246, 106, 4, 191, 83, 34, 5, 191, 83, 217, 5, 191, 245, 143, 6, 191, 56, 70, 7, 191, 29, 252, 7, 191, 162, 177, 8, 191, 199, 102, 9, 191, 140, 27, 10, 191, 240, 207, 10, 191, 243, 131, 11, 191, 147, 55, 12, 191, 209, 234, 12, 191, 172, 157, 13, 191, 36, 80, 14, 191, 56, 2, 15, 191, 232, 179, 15, 191, 50, 101, 16, 191, 24, 22, 17, 191, 151, 198, 17, 191, 176, 118, 18, 191, 99, 38, 19, 191, 174, 213, 19, 191, 145, 132, 20, 191, 13, 51, 21, 191, 31, 225, 21, 191, 200, 142, 22, 191, 8, 60, 23, 191, 221, 232, 23, 191, 72, 149, 24, 191, 72, 65, 25, 191, 220, 236, 25, 191, 4, 152, 26, 191, 192, 66, 27, 191, 15, 237, 27, 191, 240, 150, 28, 191, 99, 64, 29, 191, 104, 233, 29, 191, 254, 145, 30, 191, 37, 58, 31, 191, 220, 225, 31, 191, 35, 137, 32, 191, 250, 47, 33, 191, 95, 214, 33, 191, 82, 124, 34, 191, 212, 33, 35, 191, 227, 198, 35, 191, 127, 107, 36, 191, 167, 15, 37, 191, 92, 179, 37, 191, 157, 86, 38, 191, 104, 249, 38, 191, 191, 155, 39, 191, 160, 61, 40, 191, 11, 223, 40, 191, 255, 127, 41, 191, 125, 32, 42, 191, 131, 192, 42, 191, 17, 96, 43, 191, 39, 255, 43, 191, 196, 157, 44, 191, 232, 59, 45, 191, 146, 217, 45, 191, 195, 118, 46, 191, 121, 19, 47, 191, 180, 175, 47, 191, 115, 75, 48, 191, 183, 230, 48, 191, 127, 129, 49, 191, 203, 27, 50, 191, 153, 181, 50, 191, 234, 78, 51, 191, 189, 231, 51, 191, 18, 128, 52, 191, 232, 23, 53, 191, 63, 175, 53, 191, 22, 70, 54, 191, 110, 220, 54, 191, 69, 114, 55, 191, 156, 7, 56, 191, 113, 156, 56, 191, 197, 48, 57, 191, 150, 196, 57, 191, 230, 87, 58, 191, 178, 234, 58, 191, 252, 124, 59, 191, 194, 14, 60, 191, 3, 160, 60, 191, 193, 48, 61, 191, 250, 192, 61, 191, 173, 80, 62, 191, 219, 223, 62, 191, 131, 110, 63, 191, 165, 252, 63, 191, 64, 138, 64, 191, 83, 23, 65, 191, 224, 163, 65, 191, 228, 47, 66, 191, 96, 187, 66, 191, 83, 70, 67, 191, 190, 208, 67, 191, 158, 90, 68, 191, 246, 227, 68, 191, 194, 108, 69, 191, 5, 245, 69, 191, 188, 124, 70, 191, 232, 3, 71, 191, 137, 138, 71, 191, 157, 16, 72, 191, 37, 150, 72, 191, 32, 27, 73, 191, 142, 159, 73, 191, 111, 35, 74, 191, 193, 166, 74, 191, 134, 41, 75, 191, 188, 171, 75, 191, 99, 45, 76, 191, 122, 174, 76, 191, 2, 47, 77, 191, 250, 174, 77, 191, 98, 46, 78, 191, 57, 173, 78, 191, 126, 43, 79, 191, 51, 169, 79, 191, 85, 38, 80, 191, 230, 162, 80, 191, 228, 30, 81, 191, 80, 154, 81, 191, 40, 21, 82, 191, 109, 143, 82, 191, 30, 9, 83, 191, 59, 130, 83, 191, 195, 250, 83, 191, 183, 114, 84, 191, 22, 234, 84, 191, 223, 96, 85, 191, 18, 215, 85, 191, 176, 76, 86, 191, 183, 193, 86, 191, 39, 54, 87, 191, 0, 170, 87, 191, 66, 29, 88, 191, 236, 143, 88, 191, 254, 1, 89, 191, 120, 115, 89, 191, 89, 228, 89, 191, 162, 84, 90, 191, 81, 196, 90, 191, 102, 51, 91, 191, 226, 161, 91, 191, 195, 15, 92, 191, 10, 125, 92, 191, 183, 233, 92, 191, 200, 85, 93, 191, 62, 193, 93, 191, 24, 44, 94, 191, 87, 150, 94, 191, 249, 255, 94, 191, 255, 104, 95, 191, 104, 209, 95, 191, 51, 57, 96, 191, 98, 160, 96, 191, 243, 6, 97, 191, 229, 108, 97, 191, 58, 210, 97, 191, 240, 54, 98, 191, 8, 155, 98, 191, 128, 254, 98, 191, 89, 97, 99, 191, 146, 195, 99, 191, 44, 37, 100, 191, 37, 134, 100, 191, 126, 230, 100, 191, 55, 70, 101, 191, 78, 165, 101, 191, 197, 3, 102, 191, 154, 97, 102, 191, 205, 190, 102, 191, 94, 27, 103, 191, 77, 119, 103, 191, 154, 210, 103, 191, 68, 45, 104, 191, 75, 135, 104, 191, 174, 224, 104, 191, 111, 57, 105, 191, 139, 145, 105, 191, 4, 233, 105, 191, 217, 63, 106, 191, 9, 150, 106, 191, 148, 235, 106, 191, 123, 64, 107, 191, 188, 148, 107, 191, 89, 232, 107, 191, 79, 59, 108, 191, 160, 141, 108, 191, 75, 223, 108, 191, 79, 48, 109, 191, 173, 128, 109, 191, 101, 208, 109, 191, 117, 31, 110, 191, 223, 109, 110, 191, 161, 187, 110, 191, 187, 8, 111, 191, 46, 85, 111, 191, 248, 160, 111, 191, 27, 236, 111, 191, 149, 54, 112, 191, 103, 128, 112, 191, 144, 201, 112, 191, 15, 18, 113, 191, 230, 89, 113, 191, 19, 161, 113, 191, 151, 231, 113, 191, 113, 45, 114, 191, 160, 114, 114, 191, 38, 183, 114, 191, 1, 251, 114, 191, 50, 62, 115, 191, 184, 128, 115, 191, 148, 194, 115, 191, 196, 3, 116, 191, 73, 68, 116, 191, 34, 132, 116, 191, 80, 195, 116, 191, 210, 1, 117, 191, 168, 63, 117, 191, 210, 124, 117, 191, 80, 185, 117, 191, 33, 245, 117, 191, 69, 48, 118, 191, 189, 106, 118, 191, 136, 164, 118, 191, 166, 221, 118, 191, 22, 22, 119, 191, 217, 77, 119, 191, 239, 132, 119, 191, 87, 187, 119, 191, 17, 241, 119, 191, 29, 38, 120, 191, 122, 90, 120, 191, 42, 142, 120, 191, 43, 193, 120, 191, 125, 243, 120, 191, 33, 37, 121, 191, 22, 86, 121, 191, 92, 134, 121, 191, 242, 181, 121, 191, 218, 228, 121, 191, 18, 19, 122, 191, 154, 64, 122, 191, 115, 109, 122, 191, 157, 153, 122, 191, 22, 197, 122, 191, 223, 239, 122, 191, 248, 25, 123, 191, 97, 67, 123, 191, 26, 108, 123, 191, 34, 148, 123, 191, 122, 187, 123, 191, 32, 226, 123, 191, 23, 8, 124, 191, 92, 45, 124, 191, 240, 81, 124, 191, 211, 117, 124, 191, 5, 153, 124, 191, 134, 187, 124, 191, 85, 221, 124, 191, 115, 254, 124, 191, 223, 30, 125, 191, 154, 62, 125, 191, 163, 93, 125, 191, 250, 123, 125, 191, 159, 153, 125, 191, 146, 182, 125, 191, 211, 210, 125, 191, 98, 238, 125, 191, 63, 9, 126, 191, 105, 35, 126, 191, 225, 60, 126, 191, 167, 85, 126, 191, 186, 109, 126, 191, 27, 133, 126, 191, 201, 155, 126, 191, 196, 177, 126, 191, 13, 199, 126, 191, 162, 219, 126, 191, 133, 239, 126, 191, 181, 2, 127, 191, 50, 21, 127, 191, 252, 38, 127, 191, 19, 56, 127, 191, 118, 72, 127, 191, 39, 88, 127, 191, 36, 103, 127, 191, 110, 117, 127, 191, 5, 131, 127, 191, 232, 143, 127, 191, 25, 156, 127, 191, 149, 167, 127, 191, 95, 178, 127, 191, 116, 188, 127, 191, 215, 197, 127, 191, 133, 206, 127, 191, 129, 214, 127, 191, 200, 221, 127, 191, 93, 228, 127, 191, 61, 234, 127, 191, 106, 239, 127, 191, 227, 243, 127, 191, 169, 247, 127, 191, 187, 250, 127, 191, 25, 253, 127, 191, 196, 254, 127, 191, 187, 255, 127, 191, 250, 255, 127, 63, 57, 254, 127, 63, 169, 249, 127, 63, 75, 242, 127, 63, 30, 232, 127, 63, 35, 219, 127, 63, 89, 203, 127, 63, 193, 184, 127, 63, 91, 163, 127, 63, 40, 139, 127, 63, 39, 112, 127, 63, 90, 82, 127, 63, 191, 49, 127, 63, 88, 14, 127, 63, 37, 232, 126, 63, 38, 191, 126, 63, 92, 147, 126, 63, 200, 100, 126, 63, 105, 51, 126, 63, 65, 255, 125, 63, 79, 200, 125, 63, 150, 142, 125, 63, 20, 82, 125, 63, 203, 18, 125, 63, 188, 208, 124, 63, 231, 139, 124, 63, 77, 68, 124, 63, 239, 249, 123, 63, 205, 172, 123, 63, 233, 92, 123, 63, 67, 10, 123, 63, 221, 180, 122, 63, 182, 92, 122, 63, 209, 1, 122, 63, 46, 164, 121, 63, 206, 67, 121, 63, 178, 224, 120, 63, 220, 122, 120, 63, 76, 18, 120, 63, 4, 167, 119, 63, 4, 57, 119, 63, 79, 200, 118, 63, 228, 84, 118, 63, 198, 222, 117, 63, 246, 101, 117, 63, 117, 234, 116, 63, 68, 108, 116, 63, 101, 235, 115, 63, 218, 103, 115, 63, 163, 225, 114, 63, 194, 88, 114, 63, 57, 205, 113, 63, 9, 63, 113, 63, 52, 174, 112, 63, 187, 26, 112, 63, 160, 132, 111, 63, 228, 235, 110, 63, 138, 80, 110, 63, 147, 178, 109, 63, 1, 18, 109, 63, 213, 110, 108, 63, 17, 201, 107, 63, 183, 32, 107, 63, 201, 117, 106, 63, 73, 200, 105, 63, 57, 24, 105, 63, 155, 101, 104, 63, 111, 176, 103, 63, 186, 248, 102, 63, 124, 62, 102, 63, 184, 129, 101, 63, 111, 194, 100, 63, 164, 0, 100, 63, 90, 60, 99, 63, 145, 117, 98, 63, 76, 172, 97, 63, 142, 224, 96, 63, 89, 18, 96, 63, 174, 65, 95, 63, 145, 110, 94, 63, 3, 153, 93, 63, 8, 193, 92, 63, 160, 230, 91, 63, 207, 9, 91, 63, 152, 42, 90, 63, 251, 72, 89, 63, 253, 100, 88, 63, 159, 126, 87, 63, 229, 149, 86, 63, 208, 170, 85, 63, 99, 189, 84, 63, 161, 205, 83, 63, 140, 219, 82, 63, 39, 231, 81, 63, 117, 240, 80, 63, 121, 247, 79, 63, 52, 252, 78, 63, 171, 254, 77, 63, 223, 254, 76, 63, 212, 252, 75, 63, 140, 248, 74, 63, 10, 242, 73, 63, 82, 233, 72, 63, 101, 222, 71, 63, 71, 209, 70, 63, 251, 193, 69, 63, 132, 176, 68, 63, 229, 156, 67, 63, 32, 135, 66, 63, 58, 111, 65, 63, 52, 85, 64, 63, 19, 57, 63, 63, 216, 26, 62, 63, 136, 250, 60, 63, 38, 216, 59, 63, 180, 179, 58, 63, 54, 141, 57, 63, 175, 100, 56, 63, 34, 58, 55, 63, 147, 13, 54, 63, 5, 223, 52, 63, 124, 174, 51, 63, 249, 123, 50, 63, 130, 71, 49, 63, 25, 17, 48, 63, 194, 216, 46, 63, 127, 158, 45, 63, 86, 98, 44, 63, 72, 36, 43, 63, 90, 228, 41, 63, 144, 162, 40, 63, 235, 94, 39, 63, 113, 25, 38, 63, 37, 210, 36, 63, 9, 137, 35, 63, 35, 62, 34, 63, 117, 241, 32, 63, 4, 163, 31, 63, 210, 82, 30, 63, 228, 0, 29, 63, 61, 173, 27, 63, 225, 87, 26, 63, 211, 0, 25, 63, 25, 168, 23, 63, 180, 77, 22, 63, 170, 241, 20, 63, 253, 147, 19, 63, 178, 52, 18, 63, 204, 211, 16, 63, 80, 113, 15, 63, 66, 13, 14, 63, 164, 167, 12, 63, 124, 64, 11, 63, 205, 215, 9, 63, 154, 109, 8, 63, 233, 1, 7, 63, 189, 148, 5, 63, 25, 38, 4, 63, 3, 182, 2, 63, 126, 68, 1, 63, 28, 163, 255, 62, 110, 186, 252, 62, 250, 206, 249, 62, 202, 224, 246, 62, 228, 239, 243, 62, 81, 252, 240, 62, 26, 6, 238, 62, 71, 13, 235, 62, 224, 17, 232, 62, 237, 19, 229, 62, 119, 19, 226, 62, 135, 16, 223, 62, 36, 11, 220, 62, 88, 3, 217, 62, 42, 249, 213, 62, 164, 236, 210, 62, 205, 221, 207, 62, 175, 204, 204, 62, 82, 185, 201, 62, 191, 163, 198, 62, 254, 139, 195, 62, 24, 114, 192, 62, 22, 86, 189, 62, 0, 56, 186, 62, 224, 23, 183, 62, 189, 245, 179, 62, 161, 209, 176, 62, 149, 171, 173, 62, 162, 131, 170, 62, 207, 89, 167, 62, 39, 46, 164, 62, 178, 0, 161, 62, 121, 209, 157, 62, 133, 160, 154, 62, 223, 109, 151, 62, 143, 57, 148, 62, 160, 3, 145, 62, 26, 204, 141, 62, 5, 147, 138, 62, 107, 88, 135, 62, 86, 28, 132, 62, 205, 222, 128, 62, 182, 63, 123, 62, 16, 191, 116, 62, 187, 59, 110, 62, 201, 181, 103, 62, 77, 45, 97, 62, 89, 162, 90, 62, 255, 20, 84, 62, 81, 133, 77, 62, 99, 243, 70, 62, 70, 95, 64, 62, 13, 201, 57, 62, 202, 48, 51, 62, 144, 150, 44, 62, 114, 250, 37, 62, 130, 92, 31, 62, 210, 188, 24, 62, 118, 27, 18, 62, 127, 120, 11, 62, 1, 212, 4, 62, 29, 92, 252, 61, 114, 13, 239, 61, 41, 188, 225, 61, 102, 104, 212, 61, 78, 18, 199, 61, 8, 186, 185, 61, 184, 95, 172, 61, 132, 3, 159, 61, 146, 165, 145, 61, 7, 70, 132, 61, 18, 202, 109, 61, 122, 5, 83, 61, 145, 62, 56, 61, 164, 117, 29, 61, 252, 170, 2, 61, 202, 189, 207, 60, 86, 35, 154, 60, 97, 14, 73, 60, 197, 167, 187, 59, 61, 122, 86, 186, 9, 70, 241, 187, 18, 221, 99, 188, 80, 138, 167, 188, 65, 36, 221, 188, 227, 93, 9, 189, 35, 40, 36, 189, 150, 240, 62, 189, 242, 182, 89, 189, 234, 122, 116, 189, 26, 158, 135, 189, 66, 253, 148, 189, 200, 90, 162, 189, 134, 182, 175, 189, 87, 16, 189, 189, 22, 104, 202, 189, 155, 189, 215, 189, 195, 16, 229, 189, 105, 97, 242, 189, 101, 175, 255, 189, 74, 125, 6, 190, 104, 33, 13, 190, 250, 195, 19, 190, 237, 100, 26, 190, 46, 4, 33, 190, 172, 161, 39, 190, 83, 61, 46, 190, 16, 215, 52, 190, 210, 110, 59, 190, 134, 4, 66, 190, 25, 152, 72, 190, 121, 41, 79, 190, 148, 184, 85, 190, 86, 69, 92, 190, 174, 207, 98, 190, 137, 87, 105, 190, 214, 220, 111, 190, 128, 95, 118, 190, 120, 223, 124, 190, 84, 174, 129, 190, 129, 235, 132, 190, 56, 39, 136, 190, 114, 97, 139, 190, 36, 154, 142, 190, 69, 209, 145, 190, 205, 6, 149, 190, 179, 58, 152, 190, 238, 108, 155, 190, 116, 157, 158, 190, 61, 204, 161, 190, 64, 249, 164, 190, 115, 36, 168, 190, 207, 77, 171, 190, 73, 117, 174, 190, 218, 154, 177, 190, 120, 190, 180, 190, 27, 224, 183, 190, 186, 255, 186, 190, 75, 29, 190, 190, 199, 56, 193, 190, 37, 82, 196, 190, 91, 105, 199, 190, 97, 126, 202, 190, 48, 145, 205, 190, 188, 161, 208, 190, 0, 176, 211, 190, 241, 187, 214, 190, 135, 197, 217, 190, 186, 204, 220, 190, 129, 209, 223, 190, 211, 211, 226, 190, 169, 211, 229, 190, 250, 208, 232, 190, 189, 203, 235, 190, 234, 195, 238, 190, 120, 185, 241, 190, 96, 172, 244, 190, 154, 156, 247, 190, 28, 138, 250, 190, 223, 116, 253, 190, 109, 46, 0, 191, 3, 161, 1, 191, 45, 18, 3, 191, 230, 129, 4, 191, 44, 240, 5, 191, 250, 92, 7, 191, 76, 200, 8, 191, 30, 50, 10, 191, 108, 154, 11, 191, 50, 1, 13, 191, 108, 102, 14, 191, 23, 202, 15, 191, 45, 44, 17, 191, 172, 140, 18, 191, 144, 235, 19, 191, 213, 72, 21, 191, 118, 164, 22, 191, 113, 254, 23, 191, 192, 86, 25, 191, 98, 173, 26, 191, 81, 2, 28, 191, 138, 85, 29, 191, 9, 167, 30, 191, 203, 246, 31, 191, 204, 68, 33, 191, 9, 145, 34, 191, 124, 219, 35, 191, 36, 36, 37, 191, 253, 106, 38, 191, 2, 176, 39, 191, 48, 243, 40, 191, 132, 52, 42, 191, 250, 115, 43, 191, 143, 177, 44, 191, 63, 237, 45, 191, 7, 39, 47, 191, 227, 94, 48, 191, 208, 148, 49, 191, 202, 200, 50, 191, 206, 250, 51, 191, 218, 42, 53, 191, 232, 88, 54, 191, 247, 132, 55, 191, 2, 175, 56, 191, 7, 215, 57, 191, 3, 253, 58, 191, 241, 32, 60, 191, 207, 66, 61, 191, 154, 98, 62, 191, 79, 128, 63, 191, 233, 155, 64, 191, 104, 181, 65, 191, 198, 204, 66, 191, 1, 226, 67, 191, 23, 245, 68, 191, 3, 6, 70, 191, 196, 20, 71, 191, 86, 33, 72, 191, 182, 43, 73, 191, 225, 51, 74, 191, 212, 57, 75, 191, 141, 61, 76, 191, 9, 63, 77, 191, 68, 62, 78, 191, 61, 59, 79, 191, 240, 53, 80, 191, 90, 46, 81, 191, 121, 36, 82, 191, 74, 24, 83, 191, 202, 9, 84, 191, 247, 248, 84, 191, 206, 229, 85, 191, 77, 208, 86, 191, 112, 184, 87, 191, 55, 158, 88, 191, 156, 129, 89, 191, 160, 98, 90, 191, 62, 65, 91, 191, 117, 29, 92, 191, 65, 247, 92, 191, 162, 206, 93, 191, 148, 163, 94, 191, 20, 118, 95, 191, 34, 70, 96, 191, 186, 19, 97, 191, 217, 222, 97, 191, 127, 167, 98, 191, 169, 109, 99, 191, 84, 49, 100, 191, 126, 242, 100, 191, 38, 177, 101, 191, 73, 109, 102, 191, 229, 38, 103, 191, 248, 221, 103, 191, 128, 146, 104, 191, 123, 68, 105, 191, 232, 243, 105, 191, 195, 160, 106, 191, 12, 75, 107, 191, 192, 242, 107, 191, 222, 151, 108, 191, 100, 58, 109, 191, 80, 218, 109, 191, 160, 119, 110, 191, 83, 18, 111, 191, 102, 170, 111, 191, 217, 63, 112, 191, 169, 210, 112, 191, 213, 98, 113, 191, 91, 240, 113, 191, 58, 123, 114, 191, 113, 3, 115, 191, 253, 136, 115, 191, 222, 11, 116, 191, 17, 140, 116, 191, 150, 9, 117, 191, 107, 132, 117, 191, 143, 252, 117, 191, 0, 114, 118, 191, 189, 228, 118, 191, 198, 84, 119, 191, 24, 194, 119, 191, 178, 44, 120, 191, 147, 148, 120, 191, 187, 249, 120, 191, 40, 92, 121, 191, 217, 187, 121, 191, 205, 24, 122, 191, 2, 115, 122, 191, 121, 202, 122, 191, 47, 31, 123, 191, 36, 113, 123, 191, 88, 192, 123, 191, 201, 12, 124, 191, 118, 86, 124, 191, 95, 157, 124, 191, 130, 225, 124, 191, 224, 34, 125, 191, 119, 97, 125, 191, 71, 157, 125, 191, 79, 214, 125, 191, 142, 12, 126, 191, 4, 64, 126, 191, 176, 112, 126, 191, 146, 158, 126, 191, 169, 201, 126, 191, 245, 241, 126, 191, 117, 23, 127, 191, 41, 58, 127, 191, 16, 90, 127, 191, 43, 119, 127, 191, 120, 145, 127, 191, 248, 168, 127, 191, 170, 189, 127, 191, 143, 207, 127, 191, 165, 222, 127, 191, 237, 234, 127, 191, 102, 244, 127, 191, 17, 251, 127, 191, 237, 254, 127, 191, 234, 255, 127, 63, 229, 248, 127, 63, 166, 230, 127, 63, 45, 201, 127, 63, 124, 160, 127, 63, 149, 108, 127, 63, 121, 45, 127, 63, 44, 227, 126, 63, 177, 141, 126, 63, 11, 45, 126, 63, 63, 193, 125, 63, 82, 74, 125, 63, 72, 200, 124, 63, 40, 59, 124, 63, 247, 162, 123, 63, 189, 255, 122, 63, 128, 81, 122, 63, 72, 152, 121, 63, 30, 212, 120, 63, 9, 5, 120, 63, 19, 43, 119, 63, 70, 70, 118, 63, 172, 86, 117, 63, 78, 92, 116, 63, 56, 87, 115, 63, 118, 71, 114, 63, 19, 45, 113, 63, 28, 8, 112, 63, 158, 216, 110, 63, 165, 158, 109, 63, 64, 90, 108, 63, 126, 11, 107, 63, 107, 178, 105, 63, 25, 79, 104, 63, 150, 225, 102, 63, 242, 105, 101, 63, 62, 232, 99, 63, 139, 92, 98, 63, 234, 198, 96, 63, 109, 39, 95, 63, 38, 126, 93, 63, 40, 203, 91, 63, 133, 14, 90, 63, 83, 72, 88, 63, 163, 120, 86, 63, 139, 159, 84, 63, 32, 189, 82, 63, 118, 209, 80, 63, 163, 220, 78, 63, 189, 222, 76, 63, 219, 215, 74, 63, 19, 200, 72, 63, 124, 175, 70, 63, 46, 142, 68, 63, 65, 100, 66, 63, 206, 49, 64, 63, 236, 246, 61, 63, 180, 179, 59, 63, 66, 104, 57, 63, 173, 20, 55, 63, 16, 185, 52, 63, 134, 85, 50, 63, 41, 234, 47, 63, 21, 119, 45, 63, 101, 252, 42, 63, 53, 122, 40, 63, 161, 240, 37, 63, 198, 95, 35, 63, 192, 199, 32, 63, 172, 40, 30, 63, 169, 130, 27, 63, 212, 213, 24, 63, 74, 34, 22, 63, 42, 104, 19, 63, 147, 167, 16, 63, 164, 224, 13, 63, 123, 19, 11, 63, 57, 64, 8, 63, 253, 102, 5, 63, 231, 135, 2, 63, 45, 70, 255, 62, 91, 113, 249, 62, 151, 145, 243, 62, 36, 167, 237, 62, 69, 178, 231, 62, 60, 179, 225, 62, 76, 170, 219, 62, 186, 151, 213, 62, 201, 123, 207, 62, 190, 86, 201, 62, 223, 40, 195, 62, 112, 242, 188, 62, 183, 179, 182, 62, 251, 108, 176, 62, 129, 30, 170, 62, 146, 200, 163, 62, 115, 107, 157, 62, 108, 7, 151, 62, 197, 156, 144, 62, 199, 43, 138, 62, 185, 180, 131, 62, 199, 111, 122, 62, 33, 107, 109, 62, 17, 92, 96, 62, 41, 67, 83, 62, 253, 32, 70, 62, 32, 246, 56, 62, 38, 195, 43, 62, 164, 136, 30, 62, 45, 71, 17, 62, 87, 255, 3, 62, 110, 99, 237, 61, 194, 189, 210, 61, 218, 14, 184, 61, 222, 87, 157, 61, 251, 153, 130, 61, 188, 172, 79, 61, 101, 28, 26, 61, 153, 10, 201, 60, 42, 167, 59, 60, 193, 120, 214, 186, 45, 68, 113, 188, 87, 215, 227, 188, 76, 129, 39, 189, 148, 15, 93, 189, 21, 74, 137, 189, 90, 6, 164, 189, 109, 187, 190, 189, 34, 104, 217, 189, 78, 11, 244, 189, 227, 81, 7, 190, 47, 152, 20, 190, 247, 215, 33, 190, 165, 16, 47, 190, 166, 65, 60, 190, 100, 106, 73, 190, 77, 138, 86, 190, 205, 160, 99, 190, 80, 173, 112, 190, 69, 175, 125, 190, 13, 83, 133, 190, 158, 200, 139, 190, 13, 56, 146, 190, 18, 161, 152, 190, 102, 3, 159, 190, 191, 94, 165, 190, 216, 178, 171, 190, 105, 255, 177, 190, 43, 68, 184, 190, 216, 128, 190, 190, 42, 181, 196, 190, 219, 224, 202, 190, 165, 3, 209, 190, 69, 29, 215, 190, 117, 45, 221, 190, 241, 51, 227, 190, 118, 48, 233, 190, 192, 34, 239, 190, 141, 10, 245, 190, 155, 231, 250, 190, 211, 92, 0, 191, 56, 64, 3, 191, 219, 29, 6, 191, 155, 245, 8, 191, 90, 199, 11, 191, 247, 146, 14, 191, 84, 88, 17, 191, 80, 23, 20, 191, 205, 207, 22, 191, 172, 129, 25, 191, 208, 44, 28, 191, 26, 209, 30, 191, 109, 110, 33, 191, 171, 4, 36, 191, 183, 147, 38, 191, 116, 27, 41, 191, 199, 155, 43, 191, 147, 20, 46, 191, 187, 133, 48, 191, 38, 239, 50, 191, 183, 80, 53, 191, 85, 170, 55, 191, 227, 251, 57, 191, 74, 69, 60, 191, 110, 134, 62, 191, 55, 191, 64, 191, 139, 239, 66, 191, 83, 23, 69, 191, 117, 54, 71, 191, 218, 76, 73, 191, 107, 90, 75, 191, 16, 95, 77, 191, 179, 90, 79, 191, 62, 77, 81, 191, 154, 54, 83, 191, 179, 22, 85, 191, 114, 237, 86, 191, 197, 186, 88, 191, 149, 126, 90, 191, 208, 56, 92, 191, 98, 233, 93, 191, 56, 144, 95, 191, 64, 45, 97, 191, 103, 192, 98, 191, 156, 73, 100, 191, 206, 200, 101, 191, 235, 61, 103, 191, 227, 168, 104, 191, 167, 9, 106, 191, 39, 96, 107, 191, 84, 172, 108, 191, 31, 238, 109, 191, 122, 37, 111, 191, 88, 82, 112, 191, 171, 116, 113, 191, 103, 140, 114, 191, 127, 153, 115, 191, 231, 155, 116, 191, 149, 147, 117, 191, 126, 128, 118, 191, 150, 98, 119, 191, 212, 57, 120, 191, 47, 6, 121, 191, 158, 199, 121, 191, 23, 126, 122, 191, 148, 41, 123, 191, 13, 202, 123, 191, 122, 95, 124, 191, 213, 233, 124, 191, 24, 105, 125, 191, 62, 221, 125, 191, 64, 70, 126, 191, 28, 164, 126, 191, 204, 246, 126, 191, 77, 62, 127, 191, 156, 122, 127, 191, 182, 171, 127, 191, 153, 209, 127, 191, 67, 236, 127, 191, 180, 251, 127, 191, 166, 255, 127, 63, 148, 227, 127, 63, 156, 154, 127, 63, 204, 36, 127, 63, 56, 130, 126, 63, 253, 178, 125, 63, 63, 183, 124, 63, 42, 143, 123, 63, 243, 58, 122, 63, 212, 186, 120, 63, 17, 15, 119, 63, 246, 55, 117, 63, 213, 53, 115, 63, 8, 9, 113, 63, 241, 177, 110, 63, 249, 48, 108, 63, 144, 134, 105, 63, 47, 179, 102, 63, 83, 183, 99, 63, 132, 147, 96, 63, 78, 72, 93, 63, 69, 214, 89, 63, 3, 62, 86, 63, 43, 128, 82, 63, 101, 157, 78, 63, 94, 150, 74, 63, 204, 107, 70, 63, 106, 30, 66, 63, 249, 174, 61, 63, 64, 30, 57, 63, 13, 109, 52, 63, 50, 156, 47, 63, 135, 172, 42, 63, 235, 158, 37, 63, 63, 116, 32, 63, 109, 45, 27, 63, 97, 203, 21, 63, 13, 79, 16, 63, 104, 185, 10, 63, 107, 11, 5, 63, 46, 140, 254, 62, 221, 212, 242, 62, 241, 242, 230, 62, 127, 232, 218, 62, 166, 183, 206, 62, 136, 98, 194, 62, 78, 235, 181, 62, 42, 84, 169, 62, 81, 159, 156, 62, 253, 206, 143, 62, 109, 229, 130, 62, 206, 201, 107, 62, 98, 159, 81, 62, 48, 80, 55, 62, 211, 224, 28, 62, 241, 85, 2, 62, 98, 104, 207, 61, 124, 0, 154, 61, 36, 251, 72, 61, 27, 164, 187, 60, 243, 119, 86, 187, 100, 61, 241, 188, 187, 192, 99, 189, 103, 93, 167, 189, 20, 189, 220, 189, 3, 251, 8, 190, 115, 127, 35, 190, 52, 231, 61, 190, 164, 45, 88, 190, 38, 78, 114, 190, 18, 34, 134, 190, 137, 5, 147, 190, 52, 207, 159, 190, 213, 124, 172, 190, 51, 12, 185, 190, 26, 123, 197, 190, 91, 199, 209, 190, 205, 238, 221, 190, 80, 239, 233, 190, 199, 198, 245, 190, 144, 185, 0, 191, 38, 121, 6, 191, 36, 33, 12, 191, 141, 176, 17, 191, 102, 38, 23, 191, 186, 129, 28, 191, 152, 193, 33, 191, 21, 229, 38, 191, 74, 235, 43, 191, 86, 211, 48, 191, 91, 156, 53, 191, 131, 69, 58, 191, 253, 205, 62, 191, 252, 52, 67, 191, 188, 121, 71, 191, 125, 155, 75, 191, 132, 153, 79, 191, 31, 115, 83, 191, 161, 39, 87, 191, 99, 182, 90, 191, 198, 30, 94, 191, 48, 96, 97, 191, 15, 122, 100, 191, 216, 107, 103, 191, 7, 53, 106, 191, 31, 213, 108, 191, 169, 75, 111, 191, 55, 152, 113, 191, 98, 186, 115, 191, 201, 177, 117, 191, 22, 126, 119, 191, 246, 30, 121, 191, 33, 148, 122, 191, 85, 221, 123, 191, 89, 250, 124, 191, 250, 234, 125, 191, 14, 175, 126, 191, 116, 70, 127, 191, 15, 177, 127, 191, 206, 238, 127, 191, 0, 0, 128, 63, 0, 0, 0, 128, 99, 250, 127, 63, 191, 117, 86, 188, 139, 233, 127, 63, 10, 113, 214, 188, 121, 205, 127, 63, 231, 206, 32, 189, 47, 166, 127, 63, 58, 94, 86, 189, 175, 115, 127, 63, 19, 242, 133, 189, 249, 53, 127, 63, 42, 175, 160, 189, 18, 237, 126, 63, 51, 101, 187, 189, 253, 152, 126, 63, 4, 19, 214, 189, 188, 57, 126, 63, 115, 183, 240, 189, 85, 207, 125, 63, 168, 168, 5, 190, 203, 89, 125, 63, 187, 239, 18, 190, 37, 217, 124, 63, 92, 48, 32, 190, 103, 77, 124, 63, 245, 105, 45, 190, 152, 182, 123, 63, 243, 155, 58, 190, 190, 20, 123, 63, 194, 197, 71, 190, 226, 103, 122, 63, 205, 230, 84, 190, 9, 176, 121, 63, 130, 254, 97, 190, 60, 237, 120, 63, 77, 12, 111, 190, 132, 31, 120, 63, 156, 15, 124, 190, 234, 70, 119, 63, 238, 131, 132, 190, 119, 99, 118, 63, 62, 250, 138, 190, 54, 117, 117, 63, 117, 106, 145, 190, 48, 124, 116, 63, 76, 212, 151, 190, 113, 120, 115, 63, 122, 55, 158, 190, 3, 106, 114, 63, 183, 147, 164, 190, 244, 80, 113, 63, 188, 232, 170, 190, 79, 45, 112, 63, 65, 54, 177, 190, 33, 255, 110, 63, 1, 124, 183, 190, 118, 198, 109, 63, 180, 185, 189, 190, 94, 131, 108, 63, 21, 239, 195, 190, 231, 53, 107, 63, 222, 27, 202, 190, 30, 222, 105, 63, 201, 63, 208, 190, 18, 124, 104, 63, 146, 90, 214, 190, 212, 15, 103, 63, 243, 107, 220, 190, 116, 153, 101, 63, 170, 115, 226, 190, 1, 25, 100, 63, 113, 113, 232, 190, 141, 142, 98, 63, 7, 101, 238, 190, 40, 250, 96, 63, 39, 78, 244, 190, 230, 91, 95, 63, 144, 44, 250, 190, 215, 179, 93, 63, 0, 0, 0, 191, 15, 2, 92, 63, 27, 228, 2, 191, 160, 70, 90, 63, 119, 194, 5, 191, 158, 129, 88, 63, 246, 154, 8, 191, 29, 179, 86, 63, 119, 109, 11, 191, 49, 219, 84, 63, 218, 57, 14, 191, 239, 249, 82, 63, 0, 0, 17, 191, 108, 15, 81, 63, 202, 191, 19, 191, 189, 27, 79, 63, 24, 121, 22, 191, 248, 30, 77, 63, 205, 43, 25, 191, 52, 25, 75, 63, 202, 215, 27, 191, 136, 10, 73, 63, 241, 124, 30, 191, 10, 243, 70, 63, 36, 27, 33, 191, 209, 210, 68, 63, 70, 178, 35, 191, 247, 169, 66, 63, 58, 66, 38, 191, 147, 120, 64, 63, 227, 202, 40, 191, 189, 62, 62, 63, 37, 76, 43, 191, 143, 252, 59, 63, 227, 197, 45, 191, 34, 178, 57, 63, 1, 56, 48, 191, 144, 95, 55, 63, 101, 162, 50, 191, 243, 4, 53, 63, 243, 4, 53, 191, 101, 162, 50, 63, 144, 95, 55, 191, 1, 56, 48, 63, 34, 178, 57, 191, 227, 197, 45, 63, 143, 252, 59, 191, 37, 76, 43, 63, 189, 62, 62, 191, 227, 202, 40, 63, 147, 120, 64, 191, 58, 66, 38, 63, 247, 169, 66, 191, 70, 178, 35, 63, 209, 210, 68, 191, 36, 27, 33, 63, 10, 243, 70, 191, 241, 124, 30, 63, 136, 10, 73, 191, 202, 215, 27, 63, 52, 25, 75, 191, 205, 43, 25, 63, 248, 30, 77, 191, 24, 121, 22, 63, 189, 27, 79, 191, 202, 191, 19, 63, 108, 15, 81, 191, 0, 0, 17, 63, 239, 249, 82, 191, 218, 57, 14, 63, 49, 219, 84, 191, 119, 109, 11, 63, 29, 179, 86, 191, 246, 154, 8, 63, 158, 129, 88, 191, 119, 194, 5, 63, 160, 70, 90, 191, 27, 228, 2, 63, 15, 2, 92, 191, 0, 0, 0, 63, 215, 179, 93, 191, 144, 44, 250, 62, 230, 91, 95, 191, 39, 78, 244, 62, 40, 250, 96, 191, 7, 101, 238, 62, 141, 142, 98, 191, 113, 113, 232, 62, 1, 25, 100, 191, 170, 115, 226, 62, 116, 153, 101, 191, 243, 107, 220, 62, 212, 15, 103, 191, 146, 90, 214, 62, 18, 124, 104, 191, 201, 63, 208, 62, 30, 222, 105, 191, 222, 27, 202, 62, 231, 53, 107, 191, 21, 239, 195, 62, 94, 131, 108, 191, 180, 185, 189, 62, 118, 198, 109, 191, 1, 124, 183, 62, 33, 255, 110, 191, 65, 54, 177, 62, 79, 45, 112, 191, 188, 232, 170, 62, 244, 80, 113, 191, 183, 147, 164, 62, 3, 106, 114, 191, 122, 55, 158, 62, 113, 120, 115, 191, 76, 212, 151, 62, 48, 124, 116, 191, 117, 106, 145, 62, 54, 117, 117, 191, 62, 250, 138, 62, 119, 99, 118, 191, 238, 131, 132, 62, 234, 70, 119, 191, 156, 15, 124, 62, 132, 31, 120, 191, 77, 12, 111, 62, 60, 237, 120, 191, 130, 254, 97, 62, 9, 176, 121, 191, 205, 230, 84, 62, 226, 103, 122, 191, 194, 197, 71, 62, 190, 20, 123, 191, 243, 155, 58, 62, 152, 182, 123, 191, 245, 105, 45, 62, 103, 77, 124, 191, 92, 48, 32, 62, 37, 217, 124, 191, 187, 239, 18, 62, 203, 89, 125, 191, 168, 168, 5, 62, 85, 207, 125, 191, 115, 183, 240, 61, 188, 57, 126, 191, 4, 19, 214, 61, 253, 152, 126, 191, 51, 101, 187, 61, 18, 237, 126, 191, 42, 175, 160, 61, 249, 53, 127, 191, 19, 242, 133, 61, 175, 115, 127, 191, 58, 94, 86, 61, 47, 166, 127, 191, 231, 206, 32, 61, 121, 205, 127, 191, 10, 113, 214, 60, 139, 233, 127, 191, 191, 117, 86, 60, 99, 250, 127, 191, 0, 48, 141, 36, 0, 0, 128, 191, 191, 117, 86, 188, 99, 250, 127, 191, 10, 113, 214, 188, 139, 233, 127, 191, 231, 206, 32, 189, 121, 205, 127, 191, 58, 94, 86, 189, 47, 166, 127, 191, 19, 242, 133, 189, 175, 115, 127, 191, 42, 175, 160, 189, 249, 53, 127, 191, 51, 101, 187, 189, 18, 237, 126, 191, 4, 19, 214, 189, 253, 152, 126, 191, 115, 183, 240, 189, 188, 57, 126, 191, 168, 168, 5, 190, 85, 207, 125, 191, 187, 239, 18, 190, 203, 89, 125, 191, 92, 48, 32, 190, 37, 217, 124, 191, 245, 105, 45, 190, 103, 77, 124, 191, 243, 155, 58, 190, 152, 182, 123, 191, 194, 197, 71, 190, 190, 20, 123, 191, 205, 230, 84, 190, 226, 103, 122, 191, 130, 254, 97, 190, 9, 176, 121, 191, 77, 12, 111, 190, 60, 237, 120, 191, 156, 15, 124, 190, 132, 31, 120, 191, 238, 131, 132, 190, 234, 70, 119, 191, 62, 250, 138, 190, 119, 99, 118, 191, 117, 106, 145, 190, 54, 117, 117, 191, 76, 212, 151, 190, 48, 124, 116, 191, 122, 55, 158, 190, 113, 120, 115, 191, 183, 147, 164, 190, 3, 106, 114, 191, 188, 232, 170, 190, 244, 80, 113, 191, 65, 54, 177, 190, 79, 45, 112, 191, 1, 124, 183, 190, 33, 255, 110, 191, 180, 185, 189, 190, 118, 198, 109, 191, 21, 239, 195, 190, 94, 131, 108, 191, 222, 27, 202, 190, 231, 53, 107, 191, 201, 63, 208, 190, 30, 222, 105, 191, 146, 90, 214, 190, 18, 124, 104, 191, 243, 107, 220, 190, 212, 15, 103, 191, 170, 115, 226, 190, 116, 153, 101, 191, 113, 113, 232, 190, 1, 25, 100, 191, 7, 101, 238, 190, 141, 142, 98, 191, 39, 78, 244, 190, 40, 250, 96, 191, 144, 44, 250, 190, 230, 91, 95, 191, 0, 0, 0, 191, 215, 179, 93, 191, 27, 228, 2, 191, 15, 2, 92, 191, 119, 194, 5, 191, 160, 70, 90, 191, 246, 154, 8, 191, 158, 129, 88, 191, 119, 109, 11, 191, 29, 179, 86, 191, 218, 57, 14, 191, 49, 219, 84, 191, 0, 0, 17, 191, 239, 249, 82, 191, 202, 191, 19, 191, 108, 15, 81, 191, 24, 121, 22, 191, 189, 27, 79, 191, 205, 43, 25, 191, 248, 30, 77, 191, 202, 215, 27, 191, 52, 25, 75, 191, 241, 124, 30, 191, 136, 10, 73, 191, 36, 27, 33, 191, 10, 243, 70, 191, 70, 178, 35, 191, 209, 210, 68, 191, 58, 66, 38, 191, 247, 169, 66, 191, 227, 202, 40, 191, 147, 120, 64, 191, 37, 76, 43, 191, 189, 62, 62, 191, 227, 197, 45, 191, 143, 252, 59, 191, 1, 56, 48, 191, 34, 178, 57, 191, 101, 162, 50, 191, 144, 95, 55, 191, 243, 4, 53, 191, 243, 4, 53, 191, 144, 95, 55, 191, 101, 162, 50, 191, 34, 178, 57, 191, 1, 56, 48, 191, 143, 252, 59, 191, 227, 197, 45, 191], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 10240);
allocate([189, 62, 62, 191, 37, 76, 43, 191, 147, 120, 64, 191, 227, 202, 40, 191, 247, 169, 66, 191, 58, 66, 38, 191, 209, 210, 68, 191, 70, 178, 35, 191, 10, 243, 70, 191, 36, 27, 33, 191, 136, 10, 73, 191, 241, 124, 30, 191, 52, 25, 75, 191, 202, 215, 27, 191, 248, 30, 77, 191, 205, 43, 25, 191, 189, 27, 79, 191, 24, 121, 22, 191, 108, 15, 81, 191, 202, 191, 19, 191, 239, 249, 82, 191, 0, 0, 17, 191, 49, 219, 84, 191, 218, 57, 14, 191, 29, 179, 86, 191, 119, 109, 11, 191, 158, 129, 88, 191, 246, 154, 8, 191, 160, 70, 90, 191, 119, 194, 5, 191, 15, 2, 92, 191, 27, 228, 2, 191, 215, 179, 93, 191, 0, 0, 0, 191, 230, 91, 95, 191, 144, 44, 250, 190, 40, 250, 96, 191, 39, 78, 244, 190, 141, 142, 98, 191, 7, 101, 238, 190, 1, 25, 100, 191, 113, 113, 232, 190, 116, 153, 101, 191, 170, 115, 226, 190, 212, 15, 103, 191, 243, 107, 220, 190, 18, 124, 104, 191, 146, 90, 214, 190, 30, 222, 105, 191, 201, 63, 208, 190, 231, 53, 107, 191, 222, 27, 202, 190, 94, 131, 108, 191, 21, 239, 195, 190, 118, 198, 109, 191, 180, 185, 189, 190, 33, 255, 110, 191, 1, 124, 183, 190, 79, 45, 112, 191, 65, 54, 177, 190, 244, 80, 113, 191, 188, 232, 170, 190, 3, 106, 114, 191, 183, 147, 164, 190, 113, 120, 115, 191, 122, 55, 158, 190, 48, 124, 116, 191, 76, 212, 151, 190, 54, 117, 117, 191, 117, 106, 145, 190, 119, 99, 118, 191, 62, 250, 138, 190, 234, 70, 119, 191, 238, 131, 132, 190, 132, 31, 120, 191, 156, 15, 124, 190, 60, 237, 120, 191, 77, 12, 111, 190, 9, 176, 121, 191, 130, 254, 97, 190, 226, 103, 122, 191, 205, 230, 84, 190, 190, 20, 123, 191, 194, 197, 71, 190, 152, 182, 123, 191, 243, 155, 58, 190, 103, 77, 124, 191, 245, 105, 45, 190, 37, 217, 124, 191, 92, 48, 32, 190, 203, 89, 125, 191, 187, 239, 18, 190, 85, 207, 125, 191, 168, 168, 5, 190, 188, 57, 126, 191, 115, 183, 240, 189, 253, 152, 126, 191, 4, 19, 214, 189, 18, 237, 126, 191, 51, 101, 187, 189, 249, 53, 127, 191, 42, 175, 160, 189, 175, 115, 127, 191, 19, 242, 133, 189, 47, 166, 127, 191, 58, 94, 86, 189, 121, 205, 127, 191, 231, 206, 32, 189, 139, 233, 127, 191, 10, 113, 214, 188, 99, 250, 127, 191, 191, 117, 86, 188, 0, 0, 128, 191, 0, 48, 13, 165, 99, 250, 127, 191, 191, 117, 86, 60, 139, 233, 127, 191, 10, 113, 214, 60, 121, 205, 127, 191, 231, 206, 32, 61, 47, 166, 127, 191, 58, 94, 86, 61, 175, 115, 127, 191, 19, 242, 133, 61, 249, 53, 127, 191, 42, 175, 160, 61, 18, 237, 126, 191, 51, 101, 187, 61, 253, 152, 126, 191, 4, 19, 214, 61, 188, 57, 126, 191, 115, 183, 240, 61, 85, 207, 125, 191, 168, 168, 5, 62, 203, 89, 125, 191, 187, 239, 18, 62, 37, 217, 124, 191, 92, 48, 32, 62, 103, 77, 124, 191, 245, 105, 45, 62, 152, 182, 123, 191, 243, 155, 58, 62, 190, 20, 123, 191, 194, 197, 71, 62, 226, 103, 122, 191, 205, 230, 84, 62, 9, 176, 121, 191, 130, 254, 97, 62, 60, 237, 120, 191, 77, 12, 111, 62, 132, 31, 120, 191, 156, 15, 124, 62, 234, 70, 119, 191, 238, 131, 132, 62, 119, 99, 118, 191, 62, 250, 138, 62, 54, 117, 117, 191, 117, 106, 145, 62, 48, 124, 116, 191, 76, 212, 151, 62, 113, 120, 115, 191, 122, 55, 158, 62, 3, 106, 114, 191, 183, 147, 164, 62, 244, 80, 113, 191, 188, 232, 170, 62, 79, 45, 112, 191, 65, 54, 177, 62, 33, 255, 110, 191, 1, 124, 183, 62, 118, 198, 109, 191, 180, 185, 189, 62, 94, 131, 108, 191, 21, 239, 195, 62, 231, 53, 107, 191, 222, 27, 202, 62, 30, 222, 105, 191, 201, 63, 208, 62, 18, 124, 104, 191, 146, 90, 214, 62, 212, 15, 103, 191, 243, 107, 220, 62, 116, 153, 101, 191, 170, 115, 226, 62, 1, 25, 100, 191, 113, 113, 232, 62, 141, 142, 98, 191, 7, 101, 238, 62, 40, 250, 96, 191, 39, 78, 244, 62, 230, 91, 95, 191, 144, 44, 250, 62, 215, 179, 93, 191, 0, 0, 0, 63, 15, 2, 92, 191, 27, 228, 2, 63, 160, 70, 90, 191, 119, 194, 5, 63, 158, 129, 88, 191, 246, 154, 8, 63, 29, 179, 86, 191, 119, 109, 11, 63, 49, 219, 84, 191, 218, 57, 14, 63, 239, 249, 82, 191, 0, 0, 17, 63, 108, 15, 81, 191, 202, 191, 19, 63, 189, 27, 79, 191, 24, 121, 22, 63, 248, 30, 77, 191, 205, 43, 25, 63, 52, 25, 75, 191, 202, 215, 27, 63, 136, 10, 73, 191, 241, 124, 30, 63, 10, 243, 70, 191, 36, 27, 33, 63, 209, 210, 68, 191, 70, 178, 35, 63, 247, 169, 66, 191, 58, 66, 38, 63, 147, 120, 64, 191, 227, 202, 40, 63, 189, 62, 62, 191, 37, 76, 43, 63, 143, 252, 59, 191, 227, 197, 45, 63, 34, 178, 57, 191, 1, 56, 48, 63, 144, 95, 55, 191, 101, 162, 50, 63, 243, 4, 53, 191, 243, 4, 53, 63, 101, 162, 50, 191, 144, 95, 55, 63, 1, 56, 48, 191, 34, 178, 57, 63, 227, 197, 45, 191, 143, 252, 59, 63, 37, 76, 43, 191, 189, 62, 62, 63, 227, 202, 40, 191, 147, 120, 64, 63, 58, 66, 38, 191, 247, 169, 66, 63, 70, 178, 35, 191, 209, 210, 68, 63, 36, 27, 33, 191, 10, 243, 70, 63, 241, 124, 30, 191, 136, 10, 73, 63, 202, 215, 27, 191, 52, 25, 75, 63, 205, 43, 25, 191, 248, 30, 77, 63, 24, 121, 22, 191, 189, 27, 79, 63, 202, 191, 19, 191, 108, 15, 81, 63, 0, 0, 17, 191, 239, 249, 82, 63, 218, 57, 14, 191, 49, 219, 84, 63, 119, 109, 11, 191, 29, 179, 86, 63, 246, 154, 8, 191, 158, 129, 88, 63, 119, 194, 5, 191, 160, 70, 90, 63, 27, 228, 2, 191, 15, 2, 92, 63, 0, 0, 0, 191, 215, 179, 93, 63, 144, 44, 250, 190, 230, 91, 95, 63, 39, 78, 244, 190, 40, 250, 96, 63, 7, 101, 238, 190, 141, 142, 98, 63, 113, 113, 232, 190, 1, 25, 100, 63, 170, 115, 226, 190, 116, 153, 101, 63, 243, 107, 220, 190, 212, 15, 103, 63, 146, 90, 214, 190, 18, 124, 104, 63, 201, 63, 208, 190, 30, 222, 105, 63, 222, 27, 202, 190, 231, 53, 107, 63, 21, 239, 195, 190, 94, 131, 108, 63, 180, 185, 189, 190, 118, 198, 109, 63, 1, 124, 183, 190, 33, 255, 110, 63, 65, 54, 177, 190, 79, 45, 112, 63, 188, 232, 170, 190, 244, 80, 113, 63, 183, 147, 164, 190, 3, 106, 114, 63, 122, 55, 158, 190, 113, 120, 115, 63, 76, 212, 151, 190, 48, 124, 116, 63, 117, 106, 145, 190, 54, 117, 117, 63, 62, 250, 138, 190, 119, 99, 118, 63, 238, 131, 132, 190, 234, 70, 119, 63, 156, 15, 124, 190, 132, 31, 120, 63, 77, 12, 111, 190, 60, 237, 120, 63, 130, 254, 97, 190, 9, 176, 121, 63, 205, 230, 84, 190, 226, 103, 122, 63, 194, 197, 71, 190, 190, 20, 123, 63, 243, 155, 58, 190, 152, 182, 123, 63, 245, 105, 45, 190, 103, 77, 124, 63, 92, 48, 32, 190, 37, 217, 124, 63, 187, 239, 18, 190, 203, 89, 125, 63, 168, 168, 5, 190, 85, 207, 125, 63, 115, 183, 240, 189, 188, 57, 126, 63, 4, 19, 214, 189, 253, 152, 126, 63, 51, 101, 187, 189, 18, 237, 126, 63, 42, 175, 160, 189, 249, 53, 127, 63, 19, 242, 133, 189, 175, 115, 127, 63, 58, 94, 86, 189, 47, 166, 127, 63, 231, 206, 32, 189, 121, 205, 127, 63, 10, 113, 214, 188, 139, 233, 127, 63, 191, 117, 86, 188, 99, 250, 127, 63, 0, 200, 83, 165, 0, 0, 128, 63, 191, 117, 86, 60, 99, 250, 127, 63, 10, 113, 214, 60, 139, 233, 127, 63, 231, 206, 32, 61, 121, 205, 127, 63, 58, 94, 86, 61, 47, 166, 127, 63, 19, 242, 133, 61, 175, 115, 127, 63, 42, 175, 160, 61, 249, 53, 127, 63, 51, 101, 187, 61, 18, 237, 126, 63, 4, 19, 214, 61, 253, 152, 126, 63, 115, 183, 240, 61, 188, 57, 126, 63, 168, 168, 5, 62, 85, 207, 125, 63, 187, 239, 18, 62, 203, 89, 125, 63, 92, 48, 32, 62, 37, 217, 124, 63, 245, 105, 45, 62, 103, 77, 124, 63, 243, 155, 58, 62, 152, 182, 123, 63, 194, 197, 71, 62, 190, 20, 123, 63, 205, 230, 84, 62, 226, 103, 122, 63, 130, 254, 97, 62, 9, 176, 121, 63, 77, 12, 111, 62, 60, 237, 120, 63, 156, 15, 124, 62, 132, 31, 120, 63, 238, 131, 132, 62, 234, 70, 119, 63, 62, 250, 138, 62, 119, 99, 118, 63, 117, 106, 145, 62, 54, 117, 117, 63, 76, 212, 151, 62, 48, 124, 116, 63, 122, 55, 158, 62, 113, 120, 115, 63, 183, 147, 164, 62, 3, 106, 114, 63, 188, 232, 170, 62, 244, 80, 113, 63, 65, 54, 177, 62, 79, 45, 112, 63, 1, 124, 183, 62, 33, 255, 110, 63, 180, 185, 189, 62, 118, 198, 109, 63, 21, 239, 195, 62, 94, 131, 108, 63, 222, 27, 202, 62, 231, 53, 107, 63, 201, 63, 208, 62, 30, 222, 105, 63, 146, 90, 214, 62, 18, 124, 104, 63, 243, 107, 220, 62, 212, 15, 103, 63, 170, 115, 226, 62, 116, 153, 101, 63, 113, 113, 232, 62, 1, 25, 100, 63, 7, 101, 238, 62, 141, 142, 98, 63, 39, 78, 244, 62, 40, 250, 96, 63, 144, 44, 250, 62, 230, 91, 95, 63, 0, 0, 0, 63, 215, 179, 93, 63, 27, 228, 2, 63, 15, 2, 92, 63, 119, 194, 5, 63, 160, 70, 90, 63, 246, 154, 8, 63, 158, 129, 88, 63, 119, 109, 11, 63, 29, 179, 86, 63, 218, 57, 14, 63, 49, 219, 84, 63, 0, 0, 17, 63, 239, 249, 82, 63, 202, 191, 19, 63, 108, 15, 81, 63, 24, 121, 22, 63, 189, 27, 79, 63, 205, 43, 25, 63, 248, 30, 77, 63, 202, 215, 27, 63, 52, 25, 75, 63, 241, 124, 30, 63, 136, 10, 73, 63, 36, 27, 33, 63, 10, 243, 70, 63, 70, 178, 35, 63, 209, 210, 68, 63, 58, 66, 38, 63, 247, 169, 66, 63, 227, 202, 40, 63, 147, 120, 64, 63, 37, 76, 43, 63, 189, 62, 62, 63, 227, 197, 45, 63, 143, 252, 59, 63, 1, 56, 48, 63, 34, 178, 57, 63, 101, 162, 50, 63, 144, 95, 55, 63, 243, 4, 53, 63, 243, 4, 53, 63, 144, 95, 55, 63, 101, 162, 50, 63, 34, 178, 57, 63, 1, 56, 48, 63, 143, 252, 59, 63, 227, 197, 45, 63, 189, 62, 62, 63, 37, 76, 43, 63, 147, 120, 64, 63, 227, 202, 40, 63, 247, 169, 66, 63, 58, 66, 38, 63, 209, 210, 68, 63, 70, 178, 35, 63, 10, 243, 70, 63, 36, 27, 33, 63, 136, 10, 73, 63, 241, 124, 30, 63, 52, 25, 75, 63, 202, 215, 27, 63, 248, 30, 77, 63, 205, 43, 25, 63, 189, 27, 79, 63, 24, 121, 22, 63, 108, 15, 81, 63, 202, 191, 19, 63, 239, 249, 82, 63, 0, 0, 17, 63, 49, 219, 84, 63, 218, 57, 14, 63, 29, 179, 86, 63, 119, 109, 11, 63, 158, 129, 88, 63, 246, 154, 8, 63, 160, 70, 90, 63, 119, 194, 5, 63, 15, 2, 92, 63, 27, 228, 2, 63, 215, 179, 93, 63, 0, 0, 0, 63, 230, 91, 95, 63, 144, 44, 250, 62, 40, 250, 96, 63, 39, 78, 244, 62, 141, 142, 98, 63, 7, 101, 238, 62, 1, 25, 100, 63, 113, 113, 232, 62, 116, 153, 101, 63, 170, 115, 226, 62, 212, 15, 103, 63, 243, 107, 220, 62, 18, 124, 104, 63, 146, 90, 214, 62, 30, 222, 105, 63, 201, 63, 208, 62, 231, 53, 107, 63, 222, 27, 202, 62, 94, 131, 108, 63, 21, 239, 195, 62, 118, 198, 109, 63, 180, 185, 189, 62, 33, 255, 110, 63, 1, 124, 183, 62, 79, 45, 112, 63, 65, 54, 177, 62, 244, 80, 113, 63, 188, 232, 170, 62, 3, 106, 114, 63, 183, 147, 164, 62, 113, 120, 115, 63, 122, 55, 158, 62, 48, 124, 116, 63, 76, 212, 151, 62, 54, 117, 117, 63, 117, 106, 145, 62, 119, 99, 118, 63, 62, 250, 138, 62, 234, 70, 119, 63, 238, 131, 132, 62, 132, 31, 120, 63, 156, 15, 124, 62, 60, 237, 120, 63, 77, 12, 111, 62, 9, 176, 121, 63, 130, 254, 97, 62, 226, 103, 122, 63, 205, 230, 84, 62, 190, 20, 123, 63, 194, 197, 71, 62, 152, 182, 123, 63, 243, 155, 58, 62, 103, 77, 124, 63, 245, 105, 45, 62, 37, 217, 124, 63, 92, 48, 32, 62, 203, 89, 125, 63, 187, 239, 18, 62, 85, 207, 125, 63, 168, 168, 5, 62, 188, 57, 126, 63, 115, 183, 240, 61, 253, 152, 126, 63, 4, 19, 214, 61, 18, 237, 126, 63, 51, 101, 187, 61, 249, 53, 127, 63, 42, 175, 160, 61, 175, 115, 127, 63, 19, 242, 133, 61, 47, 166, 127, 63, 58, 94, 86, 61, 121, 205, 127, 63, 231, 206, 32, 61, 139, 233, 127, 63, 10, 113, 214, 60, 99, 250, 127, 63, 191, 117, 86, 60, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 0, 0, 206, 64, 0, 0, 200, 64, 0, 0, 184, 64, 0, 0, 170, 64, 0, 0, 162, 64, 0, 0, 154, 64, 0, 0, 144, 64, 0, 0, 140, 64, 0, 0, 156, 64, 0, 0, 150, 64, 0, 0, 146, 64, 0, 0, 142, 64, 0, 0, 156, 64, 0, 0, 148, 64, 0, 0, 138, 64, 0, 0, 144, 64, 0, 0, 140, 64, 0, 0, 148, 64, 0, 0, 152, 64, 0, 0, 142, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 112, 64, 0, 0, 102, 63, 0, 0, 76, 63, 0, 0, 38, 63, 0, 0, 0, 63, 0, 134, 107, 63, 0, 20, 46, 63, 0, 112, 189, 62, 0, 208, 76, 62, 15, 0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 0, 37, 128, 0, 0, 45, 128, 0, 0, 61, 128, 0, 0, 93, 128, 0, 0, 101, 128, 0, 0, 117, 128, 0, 0, 149, 128, 0, 0, 189, 128, 0, 0, 13, 129, 0, 0, 173, 129, 0, 0, 181, 129, 0, 0, 197, 129, 0, 0, 32, 0, 10, 0, 20, 46, 100, 1, 229, 129, 0, 0, 37, 131, 0, 0, 101, 131, 0, 0, 119, 131, 0, 0, 23, 132, 0, 0, 95, 132, 0, 0, 176, 119, 0, 0, 32, 0, 16, 0, 102, 38, 171, 1, 167, 132, 0, 0, 167, 134, 0, 0, 231, 134, 0, 0, 5, 135, 0, 0, 5, 136, 0, 0, 77, 136, 0, 0, 198, 119, 0, 0, 0, 0, 0, 0, 64, 31, 0, 0, 184, 36, 0, 0, 236, 44, 0, 0, 188, 52, 0, 0, 92, 68, 0, 0, 168, 97, 0, 0, 128, 56, 1, 0, 0, 0, 0, 0, 40, 35, 0, 0, 224, 46, 0, 0, 164, 56, 0, 0, 68, 72, 0, 0, 180, 95, 0, 0, 172, 138, 0, 0, 128, 56, 1, 0, 0, 0, 0, 0, 4, 41, 0, 0, 176, 54, 0, 0, 104, 66, 0, 0, 252, 83, 0, 0, 84, 111, 0, 0, 16, 164, 0, 0, 128, 56, 1, 0, 223, 136, 0, 0, 226, 136, 0, 0, 10, 103, 242, 14, 86, 205, 228, 29, 10, 103, 242, 14, 117, 82, 130, 12, 89, 154, 4, 25, 117, 82, 130, 12, 70, 17, 49, 10, 237, 3, 98, 20, 70, 17, 49, 10, 218, 2, 215, 7, 249, 198, 173, 15, 218, 2, 215, 7, 34, 182, 82, 5, 218, 250, 164, 10, 34, 182, 82, 5, 70, 243, 46, 30, 43, 227, 75, 14, 31, 102, 128, 24, 28, 44, 29, 10, 218, 97, 72, 18, 237, 156, 244, 6, 236, 48, 19, 11, 227, 144, 165, 4, 237, 164, 29, 2, 10, 223, 107, 3, 48, 117, 0, 0, 112, 23, 0, 0, 32, 209, 255, 255, 32, 209, 255, 255, 0, 64, 0, 0, 108, 34, 0, 0, 66, 15, 0, 0, 18, 6, 0, 0, 77, 2, 0, 0, 219, 0, 0, 0, 237, 0, 0, 0, 153, 0, 0, 0, 73, 0, 0, 0, 30, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 0, 64, 0, 0, 147, 93, 0, 0, 189, 112, 0, 0, 237, 121, 0, 0, 178, 125, 0, 0, 36, 127, 0, 0, 248, 42, 0, 0, 232, 3, 0, 0, 176, 54, 0, 0, 232, 3, 0, 0, 8, 82, 0, 0, 208, 7, 0, 0, 96, 109, 0, 0, 208, 7, 0, 0, 224, 46, 0, 0, 232, 3, 0, 0, 80, 70, 0, 0, 208, 7, 0, 0, 8, 82, 0, 0, 208, 7, 0, 0, 48, 117, 0, 0, 208, 7, 0, 0, 248, 42, 0, 0, 232, 3, 0, 0, 176, 54, 0, 0, 232, 3, 0, 0, 104, 66, 0, 0, 232, 3, 0, 0, 8, 82, 0, 0, 208, 7, 0, 0, 224, 46, 0, 0, 232, 3, 0, 0, 152, 58, 0, 0, 232, 3, 0, 0, 80, 70, 0, 0, 208, 7, 0, 0, 240, 85, 0, 0, 208, 7, 0, 0, 230, 90, 52, 56, 119, 78, 51, 57, 211, 217, 201, 57, 146, 145, 51, 58, 204, 96, 140, 58, 97, 251, 201, 58, 153, 126, 9, 59, 203, 128, 51, 59, 213, 37, 99, 59, 119, 46, 140, 59, 168, 138, 169, 59, 69, 184, 201, 59, 135, 166, 236, 59, 232, 46, 9, 60, 174, 102, 29, 60, 247, 2, 51, 60, 147, 255, 73, 60, 79, 88, 98, 60, 94, 17, 124, 60, 46, 145, 139, 60, 189, 199, 153, 60, 92, 172, 168, 60, 243, 60, 184, 60, 129, 121, 200, 60, 238, 95, 217, 60, 57, 240, 234, 60, 99, 42, 253, 60, 53, 7, 8, 61, 16, 204, 17, 61, 205, 228, 27, 61, 97, 80, 38, 61, 203, 14, 49, 61, 0, 31, 60, 61, 254, 128, 71, 61, 198, 52, 83, 61, 63, 56, 95, 61, 105, 139, 107, 61, 69, 46, 120, 61, 105, 144, 130, 61, 123, 48, 137, 61, 224, 247, 143, 61, 138, 229, 150, 61, 123, 249, 157, 61, 177, 51, 165, 61, 33, 147, 172, 61, 80, 24, 180, 61, 51, 194, 187, 61, 79, 145, 195, 61, 18, 132, 203, 61, 2, 155, 211, 61, 31, 214, 219, 61, 215, 51, 228, 61, 175, 180, 236, 61, 33, 88, 245, 61, 168, 29, 254, 61, 161, 130, 3, 62, 242, 6, 8, 62, 199, 155, 12, 62, 221, 64, 17, 62, 52, 246, 21, 62, 69, 187, 26, 62, 17, 144, 31, 62, 84, 116, 36, 62, 203, 103, 41, 62, 51, 106, 46, 62, 141, 123, 51, 62, 82, 155, 56, 62, 197, 201, 61, 62, 28, 6, 67, 62, 89, 80, 72, 62, 122, 168, 77, 62, 183, 13, 83, 62, 82, 128, 88, 62, 8, 0, 94, 62, 84, 140, 99, 62, 242, 36, 105, 62, 37, 202, 110, 62, 36, 123, 116, 62, 172, 55, 122, 62, 0, 0, 128, 62, 171, 233, 130, 62, 249, 216, 133, 62, 133, 205, 136, 62, 80, 199, 139, 62, 55, 198, 142, 62, 247, 201, 145, 62, 179, 210, 148, 62, 38, 224, 151, 62, 15, 242, 154, 62, 108, 8, 158, 62, 28, 35, 161, 62, 255, 65, 164, 62, 208, 100, 167, 62, 177, 139, 170, 62, 28, 182, 173, 62, 84, 228, 176, 62, 211, 21, 180, 62, 186, 74, 183, 62, 232, 130, 186, 62, 249, 189, 189, 62, 13, 252, 192, 62, 226, 60, 196, 62, 86, 128, 199, 62, 71, 198, 202, 62, 149, 14, 206, 62, 251, 88, 209, 62, 122, 165, 212, 62, 241, 243, 215, 62, 28, 68, 219, 62, 217, 149, 222, 62, 8, 233, 225, 62, 167, 61, 229, 62, 83, 147, 232, 62, 12, 234, 235, 62, 175, 65, 239, 62, 28, 154, 242, 62, 14, 243, 245, 62, 136, 76, 249, 62, 34, 166, 252, 62, 0, 0, 0, 63, 239, 172, 1, 63, 188, 89, 3, 63, 121, 6, 5, 63, 242, 178, 6, 63, 41, 95, 8, 63, 250, 10, 10, 63, 86, 182, 11, 63, 44, 97, 13, 63, 124, 11, 15, 63, 19, 181, 16, 63, 242, 93, 18, 63, 8, 6, 20, 63, 67, 173, 21, 63, 130, 83, 23, 63, 182, 248, 24, 63, 220, 156, 26, 63, 213, 63, 28, 63, 143, 225, 29, 63, 249, 129, 31, 63, 4, 33, 33, 63, 140, 190, 34, 63, 163, 90, 36, 63, 23, 245, 37, 63, 214, 141, 39, 63, 242, 36, 41, 63, 40, 186, 42, 63, 152, 77, 44, 63, 1, 223, 45, 63, 114, 110, 47, 63, 202, 251, 48, 63, 249, 134, 50, 63, 237, 15, 52, 63, 167, 150, 53, 63, 4, 27, 55, 63, 229, 156, 56, 63, 88, 28, 58, 63, 61, 153, 59, 63, 131, 19, 61, 63, 42, 139, 62, 63, 0, 0, 64, 63, 21, 114, 65, 63, 55, 225, 66, 63, 119, 77, 68, 63, 195, 182, 69, 63, 235, 28, 71, 63, 254, 127, 72, 63, 236, 223, 73, 63, 146, 60, 75, 63, 225, 149, 76, 63, 234, 235, 77, 63, 121, 62, 79, 63, 143, 141, 80, 63, 43, 217, 81, 63, 29, 33, 83, 63, 115, 101, 84, 63, 13, 166, 85, 63, 235, 226, 86, 63, 252, 27, 88, 63, 47, 81, 89, 63, 115, 130, 90, 63, 201, 175, 91, 63, 14, 217, 92, 63, 67, 254, 93, 63, 88, 31, 95, 63, 75, 60, 96, 63, 252, 84, 97, 63, 106, 105, 98, 63, 133, 121, 99, 63, 60, 133, 100, 63, 160, 140, 101, 63, 126, 143, 102, 63, 214, 141, 103, 63, 186, 135, 104, 63, 246, 124, 105, 63, 156, 109, 106, 63, 138, 89, 107, 63, 209, 64, 108, 63, 79, 35, 109, 63, 4, 1, 110, 63, 241, 217, 110, 63, 243, 173, 111, 63, 28, 125, 112, 63, 73, 71, 113, 63, 124, 12, 114, 63, 180, 204, 114, 63, 240, 135, 115, 63, 16, 62, 116, 63, 19, 239, 116, 63, 250, 154, 117, 63, 179, 65, 118, 63, 63, 227, 118, 63, 141, 127, 119, 63, 173, 22, 120, 63, 126, 168, 120, 63, 1, 53, 121, 63, 52, 188, 121, 63, 24, 62, 122, 63, 157, 186, 122, 63, 194, 49, 123, 63, 119, 163, 123, 63, 187, 15, 124, 63, 159, 118, 124, 63, 2, 216, 124, 63, 244, 51, 125, 63, 101, 138, 125, 63, 68, 219, 125, 63, 179, 38, 126, 63, 143, 108, 126, 63, 235, 172, 126, 63, 163, 231, 126, 63, 218, 28, 127, 63, 127, 76, 127, 63, 129, 118, 127, 63, 2, 155, 127, 63, 208, 185, 127, 63, 28, 211, 127, 63, 197, 230, 127, 63, 203, 244, 127, 63, 47, 253, 127, 63, 0, 0, 128, 63, 2, 0, 0, 0, 4, 0, 0, 0, 6, 0, 0, 0, 8, 0, 0, 0, 10, 0, 0, 0, 12, 0, 0, 0, 14, 0, 0, 0, 16, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 28, 0, 0, 0, 32, 0, 0, 0, 40, 0, 0, 0, 48, 0, 0, 0, 56, 0, 0, 0, 68, 0, 0, 0, 80, 0, 0, 0, 96, 0, 0, 0, 120, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 6, 0, 0, 0, 8, 0, 0, 0, 10, 0, 0, 0, 12, 0, 0, 0, 14, 0, 0, 0, 16, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 28, 0, 0, 0, 32, 0, 0, 0, 40, 0, 0, 0, 48, 0, 0, 0, 56, 0, 0, 0, 68, 0, 0, 0, 80, 0, 0, 0, 96, 0, 0, 0, 120, 0, 0, 0, 160, 0, 0, 0, 200, 0, 0, 0, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 0, 0, 128, 62, 208, 37, 180, 62, 151, 57, 173, 62, 9, 165, 159, 62, 250, 237, 139, 62, 205, 172, 101, 62, 248, 169, 42, 62, 52, 48, 210, 61, 90, 241, 13, 61, 90, 241, 13, 189, 52, 48, 210, 189, 248, 169, 42, 190, 205, 172, 101, 190, 250, 237, 139, 190, 9, 165, 159, 190, 151, 57, 173, 190, 208, 37, 180, 190, 135, 138, 177, 62, 27, 131, 150, 62, 96, 35, 73, 62, 196, 66, 141, 61, 196, 66, 141, 189, 96, 35, 73, 190, 27, 131, 150, 190, 135, 138, 177, 190, 135, 138, 177, 190, 27, 131, 150, 190, 96, 35, 73, 190, 196, 66, 141, 189, 196, 66, 141, 61, 96, 35, 73, 62, 27, 131, 150, 62, 135, 138, 177, 62, 151, 57, 173, 62, 205, 172, 101, 62, 90, 241, 13, 61, 248, 169, 42, 190, 9, 165, 159, 190, 208, 37, 180, 190, 250, 237, 139, 190, 52, 48, 210, 189, 52, 48, 210, 61, 250, 237, 139, 62, 208, 37, 180, 62, 9, 165, 159, 62, 248, 169, 42, 62, 90, 241, 13, 189, 205, 172, 101, 190, 151, 57, 173, 190, 125, 61, 167, 62, 210, 139, 10, 62, 210, 139, 10, 190, 125, 61, 167, 190, 125, 61, 167, 190, 210, 139, 10, 190, 210, 139, 10, 62, 125, 61, 167, 62, 125, 61, 167, 62, 210, 139, 10, 62, 210, 139, 10, 190, 125, 61, 167, 190, 125, 61, 167, 190, 210, 139, 10, 190, 210, 139, 10, 62, 125, 61, 167, 62, 9, 165, 159, 62, 90, 241, 13, 61, 250, 237, 139, 190, 151, 57, 173, 190, 52, 48, 210, 189, 205, 172, 101, 62, 208, 37, 180, 62, 248, 169, 42, 62, 248, 169, 42, 190, 208, 37, 180, 190, 205, 172, 101, 190, 52, 48, 210, 61, 151, 57, 173, 62, 250, 237, 139, 62, 90, 241, 13, 189, 9, 165, 159, 190, 27, 131, 150, 62, 196, 66, 141, 189, 135, 138, 177, 190, 96, 35, 73, 190, 96, 35, 73, 62, 135, 138, 177, 62, 196, 66, 141, 61, 27, 131, 150, 190, 27, 131, 150, 190, 196, 66, 141, 61, 135, 138, 177, 62, 96, 35, 73, 62, 96, 35, 73, 190, 135, 138, 177, 190, 196, 66, 141, 189, 27, 131, 150, 62, 250, 237, 139, 62, 248, 169, 42, 190, 151, 57, 173, 190, 90, 241, 13, 61, 208, 37, 180, 62, 52, 48, 210, 61, 9, 165, 159, 190, 205, 172, 101, 190, 205, 172, 101, 62, 9, 165, 159, 62, 52, 48, 210, 189, 208, 37, 180, 190, 90, 241, 13, 189, 151, 57, 173, 62, 248, 169, 42, 62, 250, 237, 139, 190, 0, 0, 0, 0, 5, 193, 35, 61, 233, 125, 163, 61, 37, 150, 244, 61, 226, 116, 34, 62, 172, 28, 74, 62, 221, 37, 113, 62, 52, 186, 139, 62, 180, 119, 158, 62, 228, 191, 176, 62, 173, 136, 194, 62, 37, 201, 211, 62, 24, 122, 228, 62, 24, 149, 244, 62, 200, 10, 2, 63, 28, 124, 9, 63, 73, 157, 16, 63, 202, 109, 23, 63, 192, 237, 29, 63, 159, 29, 36, 63, 84, 254, 41, 63, 46, 145, 47, 63, 224, 215, 52, 63, 99, 212, 57, 63, 240, 136, 62, 63, 211, 247, 66, 63, 171, 35, 71, 63, 23, 15, 75, 63, 216, 188, 78, 63, 173, 47, 82, 63, 106, 106, 85, 63, 206, 111, 88, 63, 154, 66, 91, 63, 142, 229, 93, 63, 75, 91, 96, 63, 110, 166, 98, 63, 100, 201, 100, 63, 155, 198, 102, 63, 111, 160, 104, 63, 247, 88, 106, 63, 128, 242, 107, 63, 223, 110, 109, 63, 11, 208, 110, 63, 202, 23, 112, 63, 224, 71, 113, 63, 225, 97, 114, 63, 77, 103, 115, 63, 150, 89, 116, 63, 12, 58, 117, 63, 255, 9, 118, 63, 138, 202, 118, 63, 187, 124, 119, 63, 192, 33, 120, 63, 98, 186, 120, 63, 157, 71, 121, 63, 75, 202, 121, 63, 36, 67, 122, 63, 242, 178, 122, 63, 59, 26, 123, 63, 200, 121, 123, 63, 32, 210, 123, 63, 200, 35, 124, 63, 55, 111, 124, 63, 242, 180, 124, 63, 94, 245, 124, 63, 224, 48, 125, 63, 236, 103, 125, 63, 183, 154, 125, 63, 180, 201, 125, 63, 6, 245, 125, 63, 17, 29, 126, 63, 24, 66, 126, 63, 78, 100, 126, 63, 211, 131, 126, 63, 253, 160, 126, 63, 237, 187, 126, 63, 195, 212, 126, 63, 179, 235, 126, 63, 239, 0, 127, 63, 135, 20, 127, 63, 141, 38, 127, 63, 67, 55, 127, 63, 170, 70, 127, 63, 227, 84, 127, 63, 15, 98, 127, 63, 47, 110, 127, 63, 100, 121, 127, 63, 190, 131, 127, 63, 63, 141, 127, 63, 24, 150, 127, 63, 56, 158, 127, 63, 194, 165, 127, 63, 163, 172, 127, 63, 16, 179, 127, 63, 245, 184, 127, 63, 119, 190, 127, 63, 114, 195, 127, 63, 25, 200, 127, 63, 108, 204, 127, 63, 91, 208, 127, 63, 6, 212, 127, 63, 111, 215, 127, 63, 131, 218, 127, 63, 102, 221, 127, 63, 21, 224, 127, 63, 130, 226, 127, 63, 205, 228, 127, 63, 230, 230, 127, 63, 205, 232, 127, 63, 146, 234, 127, 63, 70, 236, 127, 63, 200, 237, 127, 63, 40, 239, 127, 63, 120, 240, 127, 63, 166, 241, 127, 63, 195, 242, 127, 63, 191, 243, 127, 63, 186, 244, 127, 63, 148, 245, 127, 63, 94, 246, 127, 63, 39, 247, 127, 63, 207, 247, 127, 63, 119, 248, 127, 63, 253, 248, 127, 63, 148, 249, 127, 63, 9, 250, 127, 63, 127, 250, 127, 63, 244, 250, 127, 63, 89, 251, 127, 63, 173, 251, 127, 63, 1, 252, 127, 63, 84, 252, 127, 63, 152, 252, 127, 63, 219, 252, 127, 63, 30, 253, 127, 63, 80, 253, 127, 63, 130, 253, 127, 63, 181, 253, 127, 63, 231, 253, 127, 63, 9, 254, 127, 63, 59, 254, 127, 63, 93, 254, 127, 63, 126, 254, 127, 63, 143, 254, 127, 63, 176, 254, 127, 63, 210, 254, 127, 63, 227, 254, 127, 63, 244, 254, 127, 63, 21, 255, 127, 63, 38, 255, 127, 63, 55, 255, 127, 63, 71, 255, 127, 63, 88, 255, 127, 63, 88, 255, 127, 63, 105, 255, 127, 63, 122, 255, 127, 63, 122, 255, 127, 63, 139, 255, 127, 63, 155, 255, 127, 63, 155, 255, 127, 63, 155, 255, 127, 63, 172, 255, 127, 63, 172, 255, 127, 63, 189, 255, 127, 63, 189, 255, 127, 63, 189, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 206, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 222, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 239, 255, 127, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 14, 190, 192, 189, 172, 31, 155, 190, 149, 130, 26, 191, 150, 149, 70, 190, 84, 114, 62, 190, 146, 3, 26, 191, 6, 152, 62, 189, 2, 160, 234, 189, 182, 43, 212, 189, 185, 114, 30, 191, 106, 190, 162, 190, 28, 7, 46, 190, 107, 243, 143, 189, 90, 158, 23, 62, 33, 173, 209, 62, 10, 102, 12, 63, 125, 60, 188, 62, 20, 33, 253, 190, 143, 169, 67, 63, 8, 119, 235, 191, 10, 243, 46, 62, 117, 147, 76, 65, 80, 83, 139, 191, 108, 236, 162, 191, 181, 21, 130, 193, 28, 107, 193, 65, 162, 98, 178, 192, 255, 231, 48, 190, 47, 79, 39, 190, 158, 206, 101, 190, 255, 87, 194, 189, 155, 60, 149, 189, 203, 248, 135, 190, 44, 97, 205, 189, 203, 33, 83, 189, 64, 166, 21, 190, 238, 35, 247, 189, 160, 253, 56, 190, 219, 167, 3, 62, 233, 95, 226, 62, 213, 202, 252, 190, 29, 203, 43, 62, 231, 168, 83, 62, 1, 79, 74, 190, 247, 3, 214, 62, 71, 119, 192, 63, 173, 249, 69, 191, 64, 164, 32, 193, 43, 194, 205, 62, 192, 178, 62, 64, 201, 118, 115, 65, 100, 204, 241, 191, 39, 165, 152, 191, 23, 204, 233, 60, 134, 193, 132, 187, 201, 232, 144, 61, 84, 72, 7, 60, 154, 231, 189, 189, 103, 71, 42, 188, 59, 137, 140, 187, 159, 122, 160, 187, 88, 90, 145, 189, 85, 196, 39, 187, 169, 11, 34, 61, 177, 219, 103, 62, 241, 54, 5, 61, 52, 17, 38, 62, 170, 10, 205, 189, 86, 185, 248, 62, 108, 4, 2, 62, 86, 102, 146, 62, 228, 254, 126, 60, 106, 251, 215, 61, 159, 142, 67, 64, 136, 70, 147, 63, 57, 40, 129, 191, 71, 90, 234, 191, 139, 84, 84, 64, 210, 53, 91, 192, 13, 253, 243, 189, 232, 39, 38, 189, 25, 31, 226, 59, 241, 90, 147, 60, 171, 170, 28, 189, 237, 238, 195, 59, 5, 106, 150, 188, 246, 141, 249, 58, 37, 201, 19, 190, 106, 115, 50, 189, 210, 214, 129, 58, 161, 100, 98, 62, 158, 210, 17, 62, 128, 215, 247, 62, 221, 12, 207, 62, 124, 15, 3, 63, 250, 242, 114, 190, 55, 139, 119, 62, 47, 110, 179, 62, 183, 13, 51, 191, 136, 99, 38, 65, 18, 165, 41, 64, 83, 208, 27, 192, 53, 7, 134, 192, 125, 150, 135, 63, 60, 247, 218, 63, 12, 212, 218, 59, 186, 186, 147, 189, 191, 192, 34, 189, 69, 144, 20, 61, 38, 112, 235, 189, 208, 37, 193, 188, 210, 156, 6, 60, 124, 58, 104, 188, 114, 11, 7, 189, 31, 26, 17, 189, 171, 204, 53, 59, 154, 208, 148, 190, 218, 230, 146, 191, 140, 104, 163, 190, 89, 193, 47, 191, 163, 233, 188, 62, 64, 50, 245, 62, 253, 245, 58, 62, 163, 119, 210, 190, 8, 144, 97, 63, 39, 107, 147, 192, 33, 31, 188, 63, 224, 243, 171, 62, 161, 214, 232, 191, 245, 91, 241, 193, 8, 172, 177, 64, 252, 177, 255, 58, 106, 21, 253, 189, 37, 245, 148, 189, 41, 102, 131, 189, 252, 233, 90, 189, 35, 134, 221, 189, 20, 249, 191, 189, 43, 237, 142, 189, 75, 171, 225, 188, 167, 236, 68, 190, 122, 110, 225, 189, 172, 28, 146, 62, 105, 170, 207, 190, 7, 203, 189, 61, 35, 101, 147, 190, 201, 231, 89, 191, 252, 194, 203, 189, 212, 95, 111, 190, 111, 129, 164, 191, 13, 108, 145, 63, 155, 201, 71, 64, 187, 39, 143, 189, 66, 91, 238, 191, 113, 201, 41, 64, 120, 238, 233, 192, 26, 168, 28, 64, 135, 138, 146, 186, 54, 152, 129, 189, 127, 33, 26, 189, 138, 114, 25, 190, 229, 100, 18, 62, 247, 202, 60, 62, 113, 202, 252, 61, 117, 220, 154, 61, 70, 65, 240, 61, 200, 40, 191, 61, 71, 193, 141, 61, 22, 144, 172, 61, 175, 81, 144, 61, 27, 166, 113, 61, 173, 246, 192, 61, 61, 209, 229, 190, 92, 47, 215, 60, 148, 107, 138, 62, 106, 78, 134, 190, 98, 186, 48, 62, 49, 37, 0, 64, 133, 9, 35, 190, 99, 96, 29, 61, 26, 81, 35, 65, 182, 248, 132, 64, 7, 206, 21, 192, 120, 99, 97, 189, 79, 18, 30, 60, 98, 186, 16, 190, 8, 223, 224, 60, 187, 222, 12, 61, 136, 166, 71, 189, 97, 152, 194, 61, 35, 245, 253, 187, 158, 146, 24, 189, 185, 155, 179, 187, 187, 236, 135, 189, 45, 182, 196, 61, 230, 206, 76, 190, 12, 24, 41, 189, 251, 87, 22, 63, 48, 68, 83, 61, 142, 172, 172, 62, 218, 226, 90, 63, 93, 26, 43, 63, 202, 82, 235, 189, 178, 75, 104, 192, 37, 89, 239, 190, 177, 164, 92, 190, 57, 98, 39, 64, 145, 238, 207, 62, 180, 142, 174, 191, 203, 61, 46, 61, 20, 5, 250, 61, 210, 98, 191, 61, 67, 4, 252, 61, 160, 165, 11, 61, 155, 226, 17, 190, 245, 130, 15, 61, 15, 250, 72, 189, 55, 41, 150, 61, 113, 52, 108, 61, 83, 235, 253, 61, 185, 215, 83, 189, 147, 139, 129, 190, 69, 47, 23, 63, 113, 89, 21, 62, 238, 95, 161, 62, 207, 217, 98, 62, 177, 168, 24, 190, 79, 89, 93, 62, 127, 251, 178, 190, 253, 135, 196, 65, 161, 131, 126, 191, 11, 66, 29, 63, 242, 82, 150, 193, 27, 76, 53, 192, 69, 128, 55, 191, 84, 196, 177, 190, 253, 130, 245, 62, 128, 238, 123, 190, 215, 96, 155, 61, 137, 150, 12, 62, 211, 19, 54, 190, 185, 51, 243, 61, 46, 253, 141, 186, 175, 7, 115, 190, 129, 34, 182, 62, 33, 7, 5, 190, 218, 78, 96, 189, 101, 28, 163, 190, 21, 171, 166, 190, 107, 211, 56, 62, 171, 31, 128, 189, 183, 155, 16, 62, 40, 41, 176, 62, 24, 207, 192, 62, 95, 126, 23, 191, 102, 247, 186, 64, 170, 241, 194, 190, 46, 56, 99, 62, 239, 172, 181, 191, 48, 108, 229, 201, 122, 170, 171, 63, 218, 31, 232, 60, 27, 113, 55, 189, 162, 59, 173, 188, 127, 121, 210, 188, 9, 192, 100, 60, 236, 86, 170, 60, 101, 102, 48, 188, 198, 207, 53, 60, 202, 13, 112, 61, 62, 180, 207, 188, 178, 134, 6, 189, 121, 35, 243, 61, 78, 38, 94, 190, 247, 62, 21, 62, 230, 93, 245, 61, 106, 111, 187, 189, 198, 21, 247, 189, 41, 83, 161, 189, 106, 23, 19, 190, 134, 89, 24, 191, 188, 116, 147, 191, 198, 109, 160, 191, 181, 224, 149, 191, 42, 227, 138, 64, 64, 26, 110, 201, 249, 102, 175, 191, 204, 76, 36, 189, 13, 168, 87, 62, 141, 239, 11, 190, 159, 57, 11, 62, 64, 87, 86, 189, 28, 28, 54, 61, 199, 207, 107, 60, 239, 56, 135, 59, 170, 27, 158, 188, 226, 177, 95, 62, 162, 178, 225, 189, 236, 163, 1, 192, 165, 17, 107, 63, 28, 8, 29, 192, 134, 3, 153, 63, 184, 86, 123, 189, 48, 18, 246, 191, 186, 192, 157, 62, 172, 202, 254, 62, 42, 144, 105, 63, 102, 75, 86, 62, 147, 24, 22, 192, 95, 94, 12, 64, 39, 20, 207, 192, 144, 78, 217, 63, 169, 161, 57, 191, 112, 218, 66, 60, 77, 206, 26, 61, 109, 235, 98, 61, 109, 130, 185, 60, 243, 67, 144, 189, 93, 3, 246, 188, 182, 124, 73, 60, 72, 233, 136, 187, 62, 158, 140, 189, 125, 64, 0, 61, 219, 50, 32, 61, 194, 108, 186, 62, 242, 165, 193, 189, 126, 80, 188, 60, 194, 81, 50, 190, 228, 218, 168, 62, 44, 239, 234, 61, 112, 182, 153, 62, 62, 33, 219, 61, 18, 136, 7, 62, 8, 148, 185, 64, 125, 118, 104, 63, 80, 195, 103, 191, 88, 202, 86, 192, 248, 56, 67, 62, 207, 161, 60, 62, 50, 116, 44, 191, 208, 94, 109, 62, 213, 29, 112, 189, 65, 74, 108, 62, 216, 101, 224, 190, 240, 193, 123, 62, 23, 72, 48, 190, 182, 123, 179, 61, 121, 115, 56, 191, 85, 106, 38, 62, 85, 187, 139, 60, 143, 114, 208, 61, 117, 230, 198, 62, 213, 38, 170, 63, 2, 241, 138, 63, 108, 177, 111, 191, 51, 167, 23, 192, 66, 9, 215, 192, 144, 102, 92, 192, 241, 215, 8, 64, 116, 181, 99, 65, 82, 68, 157, 64, 20, 203, 69, 192, 16, 18, 27, 193, 252, 170, 68, 191, 164, 228, 229, 63, 75, 35, 97, 61, 17, 82, 39, 62, 16, 59, 163, 61, 253, 223, 12, 61, 211, 175, 99, 189, 237, 178, 165, 187, 217, 102, 153, 60, 110, 201, 5, 61, 34, 162, 189, 60, 175, 119, 31, 62, 154, 15, 67, 61, 75, 120, 130, 190, 151, 255, 204, 63, 210, 28, 77, 191, 119, 132, 35, 64, 65, 213, 60, 63, 19, 102, 174, 191, 221, 9, 50, 191, 71, 90, 28, 192, 62, 174, 221, 191, 131, 250, 124, 64, 205, 1, 242, 63, 101, 224, 248, 62, 75, 89, 53, 193, 128, 147, 112, 74, 249, 75, 195, 190, 126, 29, 248, 61, 94, 44, 104, 191, 249, 20, 60, 64, 51, 196, 209, 63, 231, 255, 97, 63, 2, 213, 95, 63, 45, 207, 155, 63, 46, 226, 95, 191, 166, 182, 164, 62, 93, 249, 72, 63, 160, 81, 114, 63, 134, 55, 19, 191, 62, 203, 93, 192, 34, 137, 98, 63, 173, 62, 189, 61, 144, 131, 30, 193, 116, 93, 200, 62, 10, 242, 35, 62, 170, 43, 3, 192, 240, 167, 132, 64, 210, 22, 140, 61, 58, 60, 20, 190, 123, 16, 146, 190, 69, 44, 194, 62, 116, 70, 148, 191, 167, 29, 227, 188, 154, 153, 29, 193, 16, 93, 154, 192, 51, 167, 109, 64, 139, 224, 119, 64, 26, 163, 97, 64, 8, 0, 0, 0, 4, 0, 0, 0, 225, 122, 84, 63, 246, 40, 92, 63, 48, 109, 0, 0, 16, 0, 0, 0, 4, 0, 0, 0, 154, 153, 89, 63, 174, 71, 97, 63, 48, 109, 0, 0, 32, 0, 0, 0, 4, 0, 0, 0, 193, 202, 97, 63, 195, 245, 104, 63, 48, 109, 0, 0, 48, 0, 0, 0, 8, 0, 0, 0, 184, 30, 101, 63, 131, 192, 106, 63, 56, 109, 0, 0, 64, 0, 0, 0, 8, 0, 0, 0, 168, 198, 107, 63, 215, 163, 112, 63, 56, 109, 0, 0, 80, 0, 0, 0, 16, 0, 0, 0, 49, 8, 108, 63, 215, 163, 112, 63, 64, 109, 0, 0, 96, 0, 0, 0, 16, 0, 0, 0, 215, 163, 112, 63, 133, 235, 113, 63, 64, 109, 0, 0, 128, 0, 0, 0, 16, 0, 0, 0, 51, 51, 115, 63, 51, 51, 115, 63, 64, 109, 0, 0, 160, 0, 0, 0, 16, 0, 0, 0, 143, 194, 117, 63, 143, 194, 117, 63, 64, 109, 0, 0, 192, 0, 0, 0, 32, 0, 0, 0, 217, 206, 119, 63, 217, 206, 119, 63, 72, 109, 0, 0, 0, 1, 0, 0, 32, 0, 0, 0, 154, 153, 121, 63, 154, 153, 121, 63, 72, 109, 0, 0, 104, 4, 0, 0, 32, 0, 0, 0, 72, 3, 0, 0, 32, 0, 0, 0, 40, 2, 0, 0, 32, 0, 0, 0, 8, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 202, 69, 27, 76, 255, 82, 130, 90, 179, 98, 162, 107, 96, 117, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 10, 0, 12, 0, 14, 0, 16, 0, 20, 0, 24, 0, 28, 0, 34, 0, 40, 0, 48, 0, 60, 0, 78, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 8, 0, 8, 0, 16, 0, 16, 0, 16, 0, 21, 0, 21, 0, 24, 0, 29, 0, 34, 0, 36, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 41, 0, 41, 0, 41, 0, 82, 0, 82, 0, 123, 0, 164, 0, 200, 0, 222, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41, 0, 41, 0, 41, 0, 41, 0, 123, 0, 123, 0, 123, 0, 164, 0, 164, 0, 240, 0, 10, 1, 27, 1, 39, 1, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 41, 0, 123, 0, 123, 0, 123, 0, 123, 0, 240, 0, 240, 0, 240, 0, 10, 1, 10, 1, 49, 1, 62, 1, 72, 1, 80, 1, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 123, 0, 240, 0, 240, 0, 240, 0, 240, 0, 49, 1, 49, 1, 49, 1, 62, 1, 62, 1, 87, 1, 95, 1, 102, 1, 108, 1, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 240, 0, 49, 1, 49, 1, 49, 1, 49, 1, 87, 1, 87, 1, 87, 1, 95, 1, 95, 1, 114, 1, 120, 1, 126, 1, 131, 1, 0, 0, 12, 0, 24, 0, 36, 0, 48, 0, 4, 0, 16, 0, 28, 0, 40, 0, 52, 0, 8, 0, 20, 0, 32, 0, 44, 0, 56, 0, 1, 0, 13, 0, 25, 0, 37, 0, 49, 0, 5, 0, 17, 0, 29, 0, 41, 0, 53, 0, 9, 0, 21, 0, 33, 0, 45, 0, 57, 0, 2, 0, 14, 0, 26, 0, 38, 0, 50, 0, 6, 0, 18, 0, 30, 0, 42, 0, 54, 0, 10, 0, 22, 0, 34, 0, 46, 0, 58, 0, 3, 0, 15, 0, 27, 0, 39, 0, 51, 0, 7, 0, 19, 0, 31, 0, 43, 0, 55, 0, 11, 0, 23, 0, 35, 0, 47, 0, 59, 0, 0, 0, 24, 0, 48, 0, 72, 0, 96, 0, 8, 0, 32, 0, 56, 0, 80, 0, 104, 0, 16, 0, 40, 0, 64, 0, 88, 0, 112, 0, 4, 0, 28, 0, 52, 0, 76, 0, 100, 0, 12, 0, 36, 0, 60, 0, 84, 0, 108, 0, 20, 0, 44, 0, 68, 0, 92, 0, 116, 0, 1, 0, 25, 0, 49, 0, 73, 0, 97, 0, 9, 0, 33, 0, 57, 0, 81, 0, 105, 0, 17, 0, 41, 0, 65, 0, 89, 0, 113, 0, 5, 0, 29, 0, 53, 0, 77, 0, 101, 0, 13, 0, 37, 0, 61, 0, 85, 0, 109, 0, 21, 0, 45, 0, 69, 0, 93, 0, 117, 0, 2, 0, 26, 0, 50, 0, 74, 0, 98, 0, 10, 0, 34, 0, 58, 0, 82, 0, 106, 0, 18, 0, 42, 0, 66, 0, 90, 0, 114, 0, 6, 0, 30, 0, 54, 0, 78, 0, 102, 0, 14, 0, 38, 0, 62, 0, 86, 0, 110, 0, 22, 0, 46, 0, 70, 0, 94, 0, 118, 0, 3, 0, 27, 0, 51, 0, 75, 0, 99, 0, 11, 0, 35, 0, 59, 0, 83, 0, 107, 0, 19, 0, 43, 0, 67, 0, 91, 0, 115, 0, 7, 0, 31, 0, 55, 0, 79, 0, 103, 0, 15, 0, 39, 0, 63, 0, 87, 0, 111, 0, 23, 0, 47, 0, 71, 0, 95, 0, 119, 0, 0, 0, 48, 0, 96, 0, 144, 0, 192, 0, 16, 0, 64, 0, 112, 0, 160, 0, 208, 0, 32, 0, 80, 0, 128, 0, 176, 0, 224, 0, 4, 0, 52, 0, 100, 0, 148, 0, 196, 0, 20, 0, 68, 0, 116, 0, 164, 0, 212, 0, 36, 0, 84, 0, 132, 0, 180, 0, 228, 0, 8, 0, 56, 0, 104, 0, 152, 0, 200, 0, 24, 0, 72, 0, 120, 0, 168, 0, 216, 0, 40, 0, 88, 0, 136, 0, 184, 0, 232, 0, 12, 0, 60, 0, 108, 0, 156, 0, 204, 0, 28, 0, 76, 0, 124, 0, 172, 0, 220, 0, 44, 0, 92, 0, 140, 0, 188, 0, 236, 0, 1, 0, 49, 0, 97, 0, 145, 0, 193, 0, 17, 0, 65, 0, 113, 0, 161, 0, 209, 0, 33, 0, 81, 0, 129, 0, 177, 0, 225, 0, 5, 0, 53, 0, 101, 0, 149, 0, 197, 0, 21, 0, 69, 0, 117, 0, 165, 0, 213, 0, 37, 0, 85, 0, 133, 0, 181, 0, 229, 0, 9, 0, 57, 0, 105, 0, 153, 0, 201, 0, 25, 0, 73, 0, 121, 0, 169, 0, 217, 0, 41, 0, 89, 0, 137, 0, 185, 0, 233, 0, 13, 0, 61, 0, 109, 0, 157, 0, 205, 0, 29, 0, 77, 0, 125, 0, 173, 0, 221, 0, 45, 0, 93, 0, 141, 0, 189, 0, 237, 0, 2, 0, 50, 0, 98, 0, 146, 0, 194, 0, 18, 0, 66, 0, 114, 0, 162, 0, 210, 0, 34, 0, 82, 0, 130, 0, 178, 0, 226, 0, 6, 0, 54, 0, 102, 0, 150, 0, 198, 0, 22, 0, 70, 0, 118, 0, 166, 0, 214, 0, 38, 0, 86, 0, 134, 0, 182, 0, 230, 0, 10, 0, 58, 0, 106, 0, 154, 0, 202, 0, 26, 0, 74, 0, 122, 0, 170, 0, 218, 0, 42, 0, 90, 0, 138, 0, 186, 0, 234, 0, 14, 0, 62, 0, 110, 0, 158, 0, 206, 0, 30, 0, 78, 0, 126, 0, 174, 0, 222, 0, 46, 0, 94, 0, 142, 0, 190, 0, 238, 0, 3, 0, 51, 0, 99, 0, 147, 0, 195, 0, 19, 0, 67, 0, 115, 0, 163, 0, 211, 0, 35, 0, 83, 0, 131, 0, 179, 0, 227, 0, 7, 0, 55, 0, 103, 0, 151, 0, 199, 0, 23, 0, 71, 0, 119, 0, 167, 0, 215, 0, 39, 0, 87, 0, 135, 0, 183, 0, 231, 0, 11, 0, 59, 0, 107, 0, 155, 0, 203, 0, 27, 0, 75, 0, 123, 0, 171, 0, 219, 0, 43, 0, 91, 0, 139, 0, 187, 0, 235, 0, 15, 0, 63, 0, 111, 0, 159, 0, 207, 0, 31, 0, 79, 0, 127, 0, 175, 0, 223, 0, 47, 0, 95, 0, 143, 0, 191, 0, 239, 0, 0, 0, 96, 0, 192, 0, 32, 1, 128, 1, 32, 0, 128, 0, 224, 0, 64, 1, 160, 1, 64, 0, 160, 0, 0, 1, 96, 1, 192, 1, 8, 0, 104, 0, 200, 0, 40, 1, 136, 1, 40, 0, 136, 0, 232, 0, 72, 1, 168, 1, 72, 0, 168, 0, 8, 1, 104, 1, 200, 1, 16, 0, 112, 0, 208, 0, 48, 1, 144, 1, 48, 0, 144, 0, 240, 0, 80, 1, 176, 1, 80, 0, 176, 0, 16, 1, 112, 1, 208, 1, 24, 0, 120, 0, 216, 0, 56, 1, 152, 1, 56, 0, 152, 0, 248, 0, 88, 1, 184, 1, 88, 0, 184, 0, 24, 1, 120, 1, 216, 1, 4, 0, 100, 0, 196, 0, 36, 1, 132, 1, 36, 0, 132, 0, 228, 0, 68, 1, 164, 1, 68, 0, 164, 0, 4, 1, 100, 1, 196, 1, 12, 0, 108, 0, 204, 0, 44, 1, 140, 1, 44, 0, 140, 0, 236, 0, 76, 1, 172, 1, 76, 0, 172, 0, 12, 1, 108, 1, 204, 1, 20, 0, 116, 0, 212, 0, 52, 1, 148, 1, 52, 0, 148, 0, 244, 0, 84, 1, 180, 1, 84, 0, 180, 0, 20, 1, 116, 1, 212, 1, 28, 0, 124, 0, 220, 0, 60, 1, 156, 1, 60, 0, 156, 0, 252, 0, 92, 1, 188, 1, 92, 0, 188, 0, 28, 1, 124, 1, 220, 1, 1, 0, 97, 0, 193, 0, 33, 1, 129, 1, 33, 0, 129, 0, 225, 0, 65, 1, 161, 1, 65, 0, 161, 0, 1, 1, 97, 1, 193, 1, 9, 0, 105, 0, 201, 0, 41, 1, 137, 1, 41, 0, 137, 0, 233, 0, 73, 1, 169, 1, 73, 0, 169, 0, 9, 1, 105, 1, 201, 1, 17, 0, 113, 0, 209, 0, 49, 1, 145, 1, 49, 0, 145, 0, 241, 0, 81, 1, 177, 1, 81, 0, 177, 0, 17, 1, 113, 1, 209, 1, 25, 0, 121, 0, 217, 0, 57, 1, 153, 1, 57, 0, 153, 0, 249, 0, 89, 1, 185, 1, 89, 0, 185, 0, 25, 1, 121, 1, 217, 1, 5, 0, 101, 0, 197, 0, 37, 1, 133, 1, 37, 0, 133, 0, 229, 0, 69, 1, 165, 1, 69, 0, 165, 0, 5, 1, 101, 1, 197, 1, 13, 0, 109, 0, 205, 0, 45, 1, 141, 1, 45, 0, 141, 0, 237, 0, 77, 1, 173, 1, 77, 0, 173, 0, 13, 1, 109, 1, 205, 1, 21, 0, 117, 0, 213, 0, 53, 1, 149, 1, 53, 0, 149, 0, 245, 0, 85, 1, 181, 1, 85, 0, 181, 0, 21, 1, 117, 1, 213, 1, 29, 0, 125, 0, 221, 0, 61, 1, 157, 1, 61, 0, 157, 0, 253, 0, 93, 1, 189, 1, 93, 0, 189, 0, 29, 1, 125, 1, 221, 1, 2, 0, 98, 0, 194, 0, 34, 1, 130, 1, 34, 0, 130, 0, 226, 0, 66, 1, 162, 1, 66, 0, 162, 0, 2, 1, 98, 1, 194, 1, 10, 0, 106, 0, 202, 0, 42, 1, 138, 1, 42, 0, 138, 0, 234, 0, 74, 1, 170, 1, 74, 0, 170, 0, 10, 1, 106, 1, 202, 1, 18, 0, 114, 0, 210, 0, 50, 1, 146, 1, 50, 0, 146, 0, 242, 0, 82, 1, 178, 1, 82, 0, 178, 0, 18, 1, 114, 1, 210, 1, 26, 0, 122, 0, 218, 0, 58, 1, 154, 1, 58, 0, 154, 0, 250, 0, 90, 1, 186, 1, 90, 0, 186, 0, 26, 1, 122, 1, 218, 1, 6, 0, 102, 0, 198, 0, 38, 1, 134, 1, 38, 0, 134, 0, 230, 0, 70, 1, 166, 1, 70, 0, 166, 0, 6, 1, 102, 1, 198, 1, 14, 0, 110, 0, 206, 0, 46, 1, 142, 1, 46, 0, 142, 0, 238, 0, 78, 1, 174, 1, 78, 0, 174, 0, 14, 1, 110, 1, 206, 1, 22, 0, 118, 0, 214, 0, 54, 1, 150, 1, 54, 0, 150, 0, 246, 0, 86, 1, 182, 1, 86, 0, 182, 0, 22, 1, 118, 1, 214, 1, 30, 0, 126, 0, 222, 0, 62, 1, 158, 1, 62, 0, 158, 0, 254, 0, 94, 1, 190, 1, 94, 0, 190, 0, 30, 1, 126, 1, 222, 1, 3, 0, 99, 0, 195, 0, 35, 1, 131, 1, 35, 0, 131, 0, 227, 0, 67, 1, 163, 1, 67, 0, 163, 0, 3, 1, 99, 1, 195, 1, 11, 0, 107, 0, 203, 0, 43, 1, 139, 1, 43, 0, 139, 0, 235, 0, 75, 1, 171, 1, 75, 0, 171, 0, 11, 1, 107, 1, 203, 1, 19, 0, 115, 0, 211, 0, 51, 1, 147, 1, 51, 0, 147, 0, 243, 0, 83, 1, 179, 1, 83, 0, 179, 0, 19, 1, 115, 1, 211, 1, 27, 0, 123, 0, 219, 0, 59, 1, 155, 1, 59, 0, 155, 0, 251, 0, 91, 1, 187, 1, 91, 0, 187, 0, 27, 1, 123, 1, 219, 1, 7, 0, 103, 0, 199, 0, 39, 1, 135, 1, 39, 0, 135, 0, 231, 0, 71, 1, 167, 1, 71, 0, 167, 0, 7, 1, 103, 1, 199, 1, 15, 0, 111, 0, 207, 0, 47, 1, 143, 1, 47, 0, 143, 0, 239, 0, 79, 1, 175, 1, 79, 0, 175, 0, 15, 1, 111, 1, 207, 1, 23, 0, 119, 0, 215, 0, 55, 1, 151, 1, 55, 0, 151, 0, 247, 0, 87, 1, 183, 1, 87, 0, 183, 0, 23, 1, 119, 1, 215, 1, 31, 0, 127, 0, 223, 0, 63, 1, 159, 1, 63, 0, 159, 0, 255, 0, 95, 1, 191, 1, 95, 0, 191, 0, 31, 1, 127, 1, 223, 1, 250, 0, 3, 0, 6, 0, 3, 0, 3, 0, 3, 0, 4, 0, 3, 0, 3, 0, 3, 0, 205, 1, 100, 0, 3, 0, 40, 0, 3, 0, 3, 0, 3, 0, 5, 0, 14, 0, 14, 0, 10, 0, 11, 0, 3, 0, 8, 0, 9, 0, 7, 0, 3, 0, 91, 1, 18, 0, 29, 0, 38, 0, 40, 0, 46, 0, 52, 0, 62, 0, 84, 0, 92, 202, 190, 216, 182, 223, 154, 226, 156, 230, 120, 236, 122, 244, 204, 252], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 20480);
allocate([52, 3, 134, 11, 136, 19, 100, 25, 102, 29, 74, 32, 66, 39, 164, 53, 100, 0, 240, 0, 32, 0, 100, 0, 205, 60, 0, 48, 0, 32, 0, 32, 254, 31, 246, 31, 234, 31, 216, 31, 194, 31, 168, 31, 136, 31, 98, 31, 58, 31, 10, 31, 216, 30, 160, 30, 98, 30, 34, 30, 220, 29, 144, 29, 66, 29, 238, 28, 150, 28, 58, 28, 216, 27, 114, 27, 10, 27, 156, 26, 42, 26, 180, 25, 58, 25, 188, 24, 60, 24, 182, 23, 46, 23, 160, 22, 16, 22, 126, 21, 232, 20, 78, 20, 176, 19, 16, 19, 110, 18, 200, 17, 30, 17, 116, 16, 198, 15, 22, 15, 100, 14, 174, 13, 248, 12, 64, 12, 132, 11, 200, 10, 10, 10, 74, 9, 138, 8, 198, 7, 2, 7, 62, 6, 120, 5, 178, 4, 234, 3, 34, 3, 90, 2, 146, 1, 202, 0, 0, 0, 54, 255, 110, 254, 166, 253, 222, 252, 22, 252, 78, 251, 136, 250, 194, 249, 254, 248, 58, 248, 118, 247, 182, 246, 246, 245, 56, 245, 124, 244, 192, 243, 8, 243, 82, 242, 156, 241, 234, 240, 58, 240, 140, 239, 226, 238, 56, 238, 146, 237, 240, 236, 80, 236, 178, 235, 24, 235, 130, 234, 240, 233, 96, 233, 210, 232, 74, 232, 196, 231, 68, 231, 198, 230, 76, 230, 214, 229, 100, 229, 246, 228, 142, 228, 40, 228, 198, 227, 106, 227, 18, 227, 190, 226, 112, 226, 36, 226, 222, 225, 158, 225, 96, 225, 40, 225, 246, 224, 198, 224, 158, 224, 120, 224, 88, 224, 62, 224, 40, 224, 22, 224, 10, 224, 2, 224, 0, 224, 42, 175, 213, 201, 207, 255, 64, 0, 17, 0, 99, 255, 97, 1, 16, 254, 163, 0, 39, 43, 189, 86, 217, 255, 6, 0, 91, 0, 86, 255, 186, 0, 23, 0, 128, 252, 192, 24, 216, 77, 237, 255, 220, 255, 102, 0, 167, 255, 232, 255, 72, 1, 73, 252, 8, 10, 37, 62, 135, 199, 61, 201, 64, 0, 128, 0, 134, 255, 36, 0, 54, 1, 0, 253, 72, 2, 51, 36, 69, 69, 12, 0, 128, 0, 18, 0, 114, 255, 32, 1, 139, 255, 159, 252, 27, 16, 123, 56, 104, 2, 13, 200, 246, 255, 39, 0, 58, 0, 210, 255, 172, 255, 120, 0, 184, 0, 197, 254, 227, 253, 4, 5, 4, 21, 64, 35, 230, 62, 198, 196, 243, 255, 0, 0, 20, 0, 26, 0, 5, 0, 225, 255, 213, 255, 252, 255, 65, 0, 90, 0, 7, 0, 99, 255, 8, 255, 212, 255, 81, 2, 47, 6, 52, 10, 199, 12, 228, 87, 5, 197, 3, 0, 242, 255, 236, 255, 241, 255, 2, 0, 25, 0, 37, 0, 25, 0, 240, 255, 185, 255, 149, 255, 177, 255, 50, 0, 36, 1, 111, 2, 214, 3, 8, 5, 184, 5, 148, 107, 103, 196, 17, 0, 12, 0, 8, 0, 1, 0, 246, 255, 234, 255, 226, 255, 224, 255, 234, 255, 3, 0, 44, 0, 100, 0, 168, 0, 243, 0, 61, 1, 125, 1, 173, 1, 199, 1, 19, 245, 149, 230, 89, 18, 243, 41, 31, 6, 84, 32, 189, 0, 168, 253, 105, 2, 103, 119, 117, 0, 97, 255, 210, 251, 8, 116, 52, 0, 221, 0, 168, 246, 116, 110, 252, 255, 17, 2, 234, 242, 229, 102, 208, 255, 246, 2, 140, 240, 165, 93, 176, 255, 137, 3, 117, 239, 6, 83, 157, 255, 204, 3, 130, 239, 102, 71, 149, 255, 199, 3, 139, 240, 39, 59, 153, 255, 128, 3, 97, 242, 174, 46, 165, 255, 5, 3, 207, 244, 94, 34, 185, 255, 99, 2, 161, 247, 152, 22, 210, 255, 169, 1, 161, 250, 180, 11, 0, 1, 1, 1, 2, 3, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 0, 3, 12, 15, 48, 51, 60, 63, 192, 195, 204, 207, 240, 243, 252, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 254, 1, 0, 1, 255, 0, 254, 0, 253, 2, 0, 1, 255, 0, 254, 0, 253, 3, 0, 1, 255, 2, 1, 0, 25, 23, 2, 0, 126, 124, 119, 109, 87, 41, 19, 9, 4, 2, 0, 255, 255, 156, 110, 86, 70, 59, 51, 45, 40, 37, 33, 31, 28, 26, 25, 23, 22, 21, 20, 19, 18, 17, 16, 16, 15, 15, 14, 13, 13, 12, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 9, 9, 9, 8, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90, 80, 75, 69, 63, 56, 49, 40, 34, 29, 20, 18, 10, 0, 0, 0, 0, 0, 0, 0, 0, 110, 100, 90, 84, 78, 71, 65, 58, 51, 45, 39, 32, 26, 20, 12, 0, 0, 0, 0, 0, 0, 118, 110, 103, 93, 86, 80, 75, 70, 65, 59, 53, 47, 40, 31, 23, 15, 4, 0, 0, 0, 0, 126, 119, 112, 104, 95, 89, 83, 78, 72, 66, 60, 54, 47, 39, 32, 25, 17, 12, 1, 0, 0, 134, 127, 120, 114, 103, 97, 91, 85, 78, 72, 66, 60, 54, 47, 41, 35, 29, 23, 16, 10, 1, 144, 137, 130, 124, 113, 107, 101, 95, 88, 82, 76, 70, 64, 57, 51, 45, 39, 33, 26, 15, 1, 152, 145, 138, 132, 123, 117, 111, 105, 98, 92, 86, 80, 74, 67, 61, 55, 49, 43, 36, 20, 1, 162, 155, 148, 142, 133, 127, 121, 115, 108, 102, 96, 90, 84, 77, 71, 65, 59, 53, 46, 30, 1, 172, 165, 158, 152, 143, 137, 131, 125, 118, 112, 106, 100, 94, 87, 81, 75, 69, 63, 56, 45, 20, 200, 200, 200, 200, 200, 200, 200, 200, 198, 193, 188, 183, 178, 173, 168, 163, 158, 153, 148, 129, 104, 40, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 40, 15, 23, 28, 31, 34, 36, 38, 39, 41, 42, 43, 44, 45, 46, 47, 47, 49, 50, 51, 52, 53, 54, 55, 55, 57, 58, 59, 60, 61, 62, 63, 63, 65, 66, 67, 68, 69, 70, 71, 71, 40, 20, 33, 41, 48, 53, 57, 61, 64, 66, 69, 71, 73, 75, 76, 78, 80, 82, 85, 87, 89, 91, 92, 94, 96, 98, 101, 103, 105, 107, 108, 110, 112, 114, 117, 119, 121, 123, 124, 126, 128, 40, 23, 39, 51, 60, 67, 73, 79, 83, 87, 91, 94, 97, 100, 102, 105, 107, 111, 115, 118, 121, 124, 126, 129, 131, 135, 139, 142, 145, 148, 150, 153, 155, 159, 163, 166, 169, 172, 174, 177, 179, 35, 28, 49, 65, 78, 89, 99, 107, 114, 120, 126, 132, 136, 141, 145, 149, 153, 159, 165, 171, 176, 180, 185, 189, 192, 199, 205, 211, 216, 220, 225, 229, 232, 239, 245, 251, 21, 33, 58, 79, 97, 112, 125, 137, 148, 157, 166, 174, 182, 189, 195, 201, 207, 217, 227, 235, 243, 251, 17, 35, 63, 86, 106, 123, 139, 152, 165, 177, 187, 197, 206, 214, 222, 230, 237, 250, 25, 31, 55, 75, 91, 105, 117, 128, 138, 146, 154, 161, 168, 174, 180, 185, 190, 200, 208, 215, 222, 229, 235, 240, 245, 255, 16, 36, 65, 89, 110, 128, 144, 159, 173, 185, 196, 207, 217, 226, 234, 242, 250, 11, 41, 74, 103, 128, 151, 172, 191, 209, 225, 241, 255, 9, 43, 79, 110, 138, 163, 186, 207, 227, 246, 12, 39, 71, 99, 123, 144, 164, 182, 198, 214, 228, 241, 253, 9, 44, 81, 113, 142, 168, 192, 214, 235, 255, 7, 49, 90, 127, 160, 191, 220, 247, 6, 51, 95, 134, 170, 203, 234, 7, 47, 87, 123, 155, 184, 212, 237, 6, 52, 97, 137, 174, 208, 240, 5, 57, 106, 151, 192, 231, 5, 59, 111, 158, 202, 243, 5, 55, 103, 147, 187, 224, 5, 60, 113, 161, 206, 248, 4, 65, 122, 175, 224, 4, 67, 127, 182, 234, 224, 224, 224, 224, 224, 224, 224, 224, 160, 160, 160, 160, 185, 185, 185, 178, 178, 168, 134, 61, 37, 224, 224, 224, 224, 224, 224, 224, 224, 240, 240, 240, 240, 207, 207, 207, 198, 198, 183, 144, 66, 40, 160, 160, 160, 160, 160, 160, 160, 160, 185, 185, 185, 185, 193, 193, 193, 183, 183, 172, 138, 64, 38, 240, 240, 240, 240, 240, 240, 240, 240, 207, 207, 207, 207, 204, 204, 204, 193, 193, 180, 143, 66, 40, 185, 185, 185, 185, 185, 185, 185, 185, 193, 193, 193, 193, 193, 193, 193, 183, 183, 172, 138, 65, 39, 207, 207, 207, 207, 207, 207, 207, 207, 204, 204, 204, 204, 201, 201, 201, 188, 188, 176, 141, 66, 40, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 193, 194, 194, 194, 184, 184, 173, 139, 65, 39, 204, 204, 204, 204, 204, 204, 204, 204, 201, 201, 201, 201, 198, 198, 198, 187, 187, 175, 140, 66, 40, 72, 127, 65, 129, 66, 128, 65, 128, 64, 128, 62, 128, 64, 128, 64, 128, 92, 78, 92, 79, 92, 78, 90, 79, 116, 41, 115, 40, 114, 40, 132, 26, 132, 26, 145, 17, 161, 12, 176, 10, 177, 11, 24, 179, 48, 138, 54, 135, 54, 132, 53, 134, 56, 133, 55, 132, 55, 132, 61, 114, 70, 96, 74, 88, 75, 88, 87, 74, 89, 66, 91, 67, 100, 59, 108, 50, 120, 40, 122, 37, 97, 43, 78, 50, 83, 78, 84, 81, 88, 75, 86, 74, 87, 71, 90, 73, 93, 74, 93, 74, 109, 40, 114, 36, 117, 34, 117, 34, 143, 17, 145, 18, 146, 19, 162, 12, 165, 10, 178, 7, 189, 6, 190, 8, 177, 9, 23, 178, 54, 115, 63, 102, 66, 98, 69, 99, 74, 89, 71, 91, 73, 91, 78, 89, 86, 80, 92, 66, 93, 64, 102, 59, 103, 60, 104, 60, 117, 52, 123, 44, 138, 35, 133, 31, 97, 38, 77, 45, 61, 90, 93, 60, 105, 42, 107, 41, 110, 45, 116, 38, 113, 38, 112, 38, 124, 26, 132, 27, 136, 19, 140, 20, 155, 14, 159, 16, 158, 18, 170, 13, 177, 10, 187, 8, 192, 6, 175, 9, 159, 10, 21, 178, 59, 110, 71, 86, 75, 85, 84, 83, 91, 66, 88, 73, 87, 72, 92, 75, 98, 72, 105, 58, 107, 54, 115, 52, 114, 55, 112, 56, 129, 51, 132, 40, 150, 33, 140, 29, 98, 35, 77, 42, 42, 121, 96, 66, 108, 43, 111, 40, 117, 44, 123, 32, 120, 36, 119, 33, 127, 33, 134, 34, 139, 21, 147, 23, 152, 20, 158, 25, 154, 26, 166, 21, 173, 16, 184, 13, 184, 10, 150, 13, 139, 15, 22, 178, 63, 114, 74, 82, 84, 83, 92, 82, 103, 62, 96, 72, 96, 67, 101, 73, 107, 72, 113, 55, 118, 52, 125, 52, 118, 52, 117, 55, 135, 49, 137, 39, 157, 32, 145, 29, 97, 33, 77, 40, 2, 1, 0, 0, 8, 13, 16, 19, 21, 23, 24, 26, 27, 28, 29, 30, 31, 32, 32, 33, 34, 34, 35, 36, 36, 37, 37, 224, 112, 44, 15, 3, 2, 1, 0, 254, 237, 192, 132, 70, 23, 4, 0, 255, 252, 226, 155, 61, 11, 2, 0, 250, 245, 234, 203, 71, 50, 42, 38, 35, 33, 31, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 179, 99, 0, 8, 16, 32, 71, 56, 43, 30, 21, 12, 6, 0, 199, 165, 144, 124, 109, 96, 84, 71, 61, 51, 42, 32, 23, 15, 8, 0, 241, 225, 211, 199, 187, 175, 164, 153, 142, 132, 123, 114, 105, 96, 88, 80, 72, 64, 57, 50, 44, 38, 33, 29, 24, 20, 16, 12, 9, 5, 2, 0, 15, 131, 138, 138, 155, 155, 173, 173, 69, 93, 115, 118, 131, 138, 141, 138, 150, 150, 155, 150, 155, 160, 166, 160, 131, 128, 134, 141, 141, 141, 145, 145, 145, 150, 155, 155, 155, 155, 160, 160, 160, 160, 166, 166, 173, 173, 182, 192, 182, 192, 192, 192, 205, 192, 205, 224, 4, 6, 24, 7, 5, 0, 0, 2, 0, 0, 12, 28, 41, 13, 252, 247, 15, 42, 25, 14, 1, 254, 62, 41, 247, 246, 37, 65, 252, 3, 250, 4, 66, 7, 248, 16, 14, 38, 253, 33, 13, 22, 39, 23, 12, 255, 36, 64, 27, 250, 249, 10, 55, 43, 17, 1, 1, 8, 1, 1, 6, 245, 74, 53, 247, 244, 55, 76, 244, 8, 253, 3, 93, 27, 252, 26, 39, 59, 3, 248, 2, 0, 77, 11, 9, 248, 22, 44, 250, 7, 40, 9, 26, 3, 9, 249, 20, 101, 249, 4, 3, 248, 42, 26, 0, 241, 33, 68, 2, 23, 254, 55, 46, 254, 15, 3, 255, 21, 16, 41, 250, 27, 61, 39, 5, 245, 42, 88, 4, 1, 254, 60, 65, 6, 252, 255, 251, 73, 56, 1, 247, 19, 94, 29, 247, 0, 12, 99, 6, 4, 8, 237, 102, 46, 243, 3, 2, 13, 3, 2, 9, 235, 84, 72, 238, 245, 46, 104, 234, 8, 18, 38, 48, 23, 0, 240, 70, 83, 235, 11, 5, 245, 117, 22, 248, 250, 23, 117, 244, 3, 3, 248, 95, 28, 4, 246, 15, 77, 60, 241, 255, 4, 124, 2, 252, 3, 38, 84, 24, 231, 2, 13, 42, 13, 31, 21, 252, 56, 46, 255, 255, 35, 79, 243, 19, 249, 65, 88, 247, 242, 20, 4, 81, 49, 227, 20, 0, 75, 3, 239, 5, 247, 44, 92, 248, 1, 253, 22, 69, 31, 250, 95, 41, 244, 5, 39, 67, 16, 252, 1, 0, 250, 120, 55, 220, 243, 44, 122, 4, 232, 81, 5, 11, 3, 7, 2, 0, 9, 10, 88, 46, 2, 90, 87, 93, 91, 82, 98, 109, 120, 118, 12, 113, 115, 117, 119, 99, 59, 87, 111, 63, 111, 112, 80, 126, 124, 125, 124, 129, 121, 126, 23, 132, 127, 127, 127, 126, 127, 122, 133, 130, 134, 101, 118, 119, 145, 126, 86, 124, 120, 123, 119, 170, 173, 107, 109, 12, 35, 60, 83, 108, 132, 157, 180, 206, 228, 15, 32, 55, 77, 101, 125, 151, 175, 201, 225, 19, 42, 66, 89, 114, 137, 162, 184, 209, 230, 12, 25, 50, 72, 97, 120, 147, 172, 200, 223, 26, 44, 69, 90, 114, 135, 159, 180, 205, 225, 13, 22, 53, 80, 106, 130, 156, 180, 205, 228, 15, 25, 44, 64, 90, 115, 142, 168, 196, 222, 19, 24, 62, 82, 100, 120, 145, 168, 190, 214, 22, 31, 50, 79, 103, 120, 151, 170, 203, 227, 21, 29, 45, 65, 106, 124, 150, 171, 196, 224, 30, 49, 75, 97, 121, 142, 165, 186, 209, 229, 19, 25, 52, 70, 93, 116, 143, 166, 192, 219, 26, 34, 62, 75, 97, 118, 145, 167, 194, 217, 25, 33, 56, 70, 91, 113, 143, 165, 196, 223, 21, 34, 51, 72, 97, 117, 145, 171, 196, 222, 20, 29, 50, 67, 90, 117, 144, 168, 197, 221, 22, 31, 48, 66, 95, 117, 146, 168, 196, 222, 24, 33, 51, 77, 116, 134, 158, 180, 200, 224, 21, 28, 70, 87, 106, 124, 149, 170, 194, 217, 26, 33, 53, 64, 83, 117, 152, 173, 204, 225, 27, 34, 65, 95, 108, 129, 155, 174, 210, 225, 20, 26, 72, 99, 113, 131, 154, 176, 200, 219, 34, 43, 61, 78, 93, 114, 155, 177, 205, 229, 23, 29, 54, 97, 124, 138, 163, 179, 209, 229, 30, 38, 56, 89, 118, 129, 158, 178, 200, 231, 21, 29, 49, 63, 85, 111, 142, 163, 193, 222, 27, 48, 77, 103, 133, 158, 179, 196, 215, 232, 29, 47, 74, 99, 124, 151, 176, 198, 220, 237, 33, 42, 61, 76, 93, 121, 155, 174, 207, 225, 29, 53, 87, 112, 136, 154, 170, 188, 208, 227, 24, 30, 52, 84, 131, 150, 166, 186, 203, 229, 37, 48, 64, 84, 104, 118, 156, 177, 201, 230, 212, 178, 148, 129, 108, 96, 85, 82, 79, 77, 61, 59, 57, 56, 51, 49, 48, 45, 42, 41, 40, 38, 36, 34, 31, 30, 21, 12, 10, 3, 1, 0, 255, 245, 244, 236, 233, 225, 217, 203, 190, 176, 175, 161, 149, 136, 125, 114, 102, 91, 81, 71, 60, 52, 43, 35, 28, 20, 19, 18, 12, 11, 5, 0, 179, 138, 140, 148, 151, 149, 153, 151, 163, 116, 67, 82, 59, 92, 72, 100, 89, 92, 16, 0, 0, 0, 0, 99, 66, 36, 36, 34, 36, 34, 34, 34, 34, 83, 69, 36, 52, 34, 116, 102, 70, 68, 68, 176, 102, 68, 68, 34, 65, 85, 68, 84, 36, 116, 141, 152, 139, 170, 132, 187, 184, 216, 137, 132, 249, 168, 185, 139, 104, 102, 100, 68, 68, 178, 218, 185, 185, 170, 244, 216, 187, 187, 170, 244, 187, 187, 219, 138, 103, 155, 184, 185, 137, 116, 183, 155, 152, 136, 132, 217, 184, 184, 170, 164, 217, 171, 155, 139, 244, 169, 184, 185, 170, 164, 216, 223, 218, 138, 214, 143, 188, 218, 168, 244, 141, 136, 155, 170, 168, 138, 220, 219, 139, 164, 219, 202, 216, 137, 168, 186, 246, 185, 139, 116, 185, 219, 185, 138, 100, 100, 134, 100, 102, 34, 68, 68, 100, 68, 168, 203, 221, 218, 168, 167, 154, 136, 104, 70, 164, 246, 171, 137, 139, 137, 155, 218, 219, 139, 255, 254, 253, 238, 14, 3, 2, 1, 0, 255, 254, 252, 218, 35, 3, 2, 1, 0, 255, 254, 250, 208, 59, 4, 2, 1, 0, 255, 254, 246, 194, 71, 10, 2, 1, 0, 255, 252, 236, 183, 82, 8, 2, 1, 0, 255, 252, 235, 180, 90, 17, 2, 1, 0, 255, 248, 224, 171, 97, 30, 4, 1, 0, 255, 254, 236, 173, 95, 37, 7, 1, 0, 255, 255, 255, 131, 6, 145, 255, 255, 255, 255, 255, 236, 93, 15, 96, 255, 255, 255, 255, 255, 194, 83, 25, 71, 221, 255, 255, 255, 255, 162, 73, 34, 66, 162, 255, 255, 255, 210, 126, 73, 43, 57, 173, 255, 255, 255, 201, 125, 71, 48, 58, 130, 255, 255, 255, 166, 110, 73, 57, 62, 104, 210, 255, 255, 251, 123, 65, 55, 68, 100, 171, 255, 7, 23, 38, 54, 69, 85, 100, 116, 131, 147, 162, 178, 193, 208, 223, 239, 13, 25, 41, 55, 69, 83, 98, 112, 127, 142, 157, 171, 187, 203, 220, 236, 15, 21, 34, 51, 61, 78, 92, 106, 126, 136, 152, 167, 185, 205, 225, 240, 10, 21, 36, 50, 63, 79, 95, 110, 126, 141, 157, 173, 189, 205, 221, 237, 17, 20, 37, 51, 59, 78, 89, 107, 123, 134, 150, 164, 184, 205, 224, 240, 10, 15, 32, 51, 67, 81, 96, 112, 129, 142, 158, 173, 189, 204, 220, 236, 8, 21, 37, 51, 65, 79, 98, 113, 126, 138, 155, 168, 179, 192, 209, 218, 12, 15, 34, 55, 63, 78, 87, 108, 118, 131, 148, 167, 185, 203, 219, 236, 16, 19, 32, 36, 56, 79, 91, 108, 118, 136, 154, 171, 186, 204, 220, 237, 11, 28, 43, 58, 74, 89, 105, 120, 135, 150, 165, 180, 196, 211, 226, 241, 6, 16, 33, 46, 60, 75, 92, 107, 123, 137, 156, 169, 185, 199, 214, 225, 11, 19, 30, 44, 57, 74, 89, 105, 121, 135, 152, 169, 186, 202, 218, 234, 12, 19, 29, 46, 57, 71, 88, 100, 120, 132, 148, 165, 182, 199, 216, 233, 17, 23, 35, 46, 56, 77, 92, 106, 123, 134, 152, 167, 185, 204, 222, 237, 14, 17, 45, 53, 63, 75, 89, 107, 115, 132, 151, 171, 188, 206, 221, 240, 9, 16, 29, 40, 56, 71, 88, 103, 119, 137, 154, 171, 189, 205, 222, 237, 16, 19, 36, 48, 57, 76, 87, 105, 118, 132, 150, 167, 185, 202, 218, 236, 12, 17, 29, 54, 71, 81, 94, 104, 126, 136, 149, 164, 182, 201, 221, 237, 15, 28, 47, 62, 79, 97, 115, 129, 142, 155, 168, 180, 194, 208, 223, 238, 8, 14, 30, 45, 62, 78, 94, 111, 127, 143, 159, 175, 192, 207, 223, 239, 17, 30, 49, 62, 79, 92, 107, 119, 132, 145, 160, 174, 190, 204, 220, 235, 14, 19, 36, 45, 61, 76, 91, 108, 121, 138, 154, 172, 189, 205, 222, 238, 12, 18, 31, 45, 60, 76, 91, 107, 123, 138, 154, 171, 187, 204, 221, 236, 13, 17, 31, 43, 53, 70, 83, 103, 114, 131, 149, 167, 185, 203, 220, 237, 17, 22, 35, 42, 58, 78, 93, 110, 125, 139, 155, 170, 188, 206, 224, 240, 8, 15, 34, 50, 67, 83, 99, 115, 131, 146, 162, 178, 193, 209, 224, 239, 13, 16, 41, 66, 73, 86, 95, 111, 128, 137, 150, 163, 183, 206, 225, 241, 17, 25, 37, 52, 63, 75, 92, 102, 119, 132, 144, 160, 175, 191, 212, 231, 19, 31, 49, 65, 83, 100, 117, 133, 147, 161, 174, 187, 200, 213, 227, 242, 18, 31, 52, 68, 88, 103, 117, 126, 138, 149, 163, 177, 192, 207, 223, 239, 16, 29, 47, 61, 76, 90, 106, 119, 133, 147, 161, 176, 193, 209, 224, 240, 15, 21, 35, 50, 61, 73, 86, 97, 110, 119, 129, 141, 175, 198, 218, 237, 225, 204, 201, 184, 183, 175, 158, 154, 153, 135, 119, 115, 113, 110, 109, 99, 98, 95, 79, 68, 52, 50, 48, 45, 43, 32, 31, 27, 18, 10, 3, 0, 255, 251, 235, 230, 212, 201, 196, 182, 167, 166, 163, 151, 138, 124, 110, 104, 90, 78, 76, 70, 69, 57, 45, 34, 24, 21, 11, 6, 5, 4, 3, 0, 175, 148, 160, 176, 178, 173, 174, 164, 177, 174, 196, 182, 198, 192, 182, 68, 62, 66, 60, 72, 117, 85, 90, 118, 136, 151, 142, 160, 142, 155, 0, 0, 0, 0, 0, 0, 0, 1, 100, 102, 102, 68, 68, 36, 34, 96, 164, 107, 158, 185, 180, 185, 139, 102, 64, 66, 36, 34, 34, 0, 1, 32, 208, 139, 141, 191, 152, 185, 155, 104, 96, 171, 104, 166, 102, 102, 102, 132, 1, 0, 0, 0, 0, 16, 16, 0, 80, 109, 78, 107, 185, 139, 103, 101, 208, 212, 141, 139, 173, 153, 123, 103, 36, 0, 0, 0, 0, 0, 0, 1, 48, 0, 0, 0, 0, 0, 0, 32, 68, 135, 123, 119, 119, 103, 69, 98, 68, 103, 120, 118, 118, 102, 71, 98, 134, 136, 157, 184, 182, 153, 139, 134, 208, 168, 248, 75, 189, 143, 121, 107, 32, 49, 34, 34, 34, 0, 17, 2, 210, 235, 139, 123, 185, 137, 105, 134, 98, 135, 104, 182, 100, 183, 171, 134, 100, 70, 68, 70, 66, 66, 34, 131, 64, 166, 102, 68, 36, 2, 1, 0, 134, 166, 102, 68, 34, 34, 66, 132, 212, 246, 158, 139, 107, 107, 87, 102, 100, 219, 125, 122, 137, 118, 103, 132, 114, 135, 137, 105, 171, 106, 50, 34, 164, 214, 141, 143, 185, 151, 121, 103, 192, 34, 0, 0, 0, 0, 0, 1, 208, 109, 74, 187, 134, 249, 159, 137, 102, 110, 154, 118, 87, 101, 119, 101, 0, 2, 0, 36, 36, 66, 68, 35, 96, 164, 102, 100, 36, 0, 2, 33, 167, 138, 174, 102, 100, 84, 2, 2, 100, 107, 120, 119, 36, 197, 24, 0, 255, 254, 253, 244, 12, 3, 2, 1, 0, 255, 254, 252, 224, 38, 3, 2, 1, 0, 255, 254, 251, 209, 57, 4, 2, 1, 0, 255, 254, 244, 195, 69, 4, 2, 1, 0, 255, 251, 232, 184, 84, 7, 2, 1, 0, 255, 254, 240, 186, 86, 14, 2, 1, 0, 255, 254, 239, 178, 91, 30, 5, 1, 0, 255, 248, 227, 177, 100, 19, 2, 1, 0, 255, 255, 255, 156, 4, 154, 255, 255, 255, 255, 255, 227, 102, 15, 92, 255, 255, 255, 255, 255, 213, 83, 24, 72, 236, 255, 255, 255, 255, 150, 76, 33, 63, 214, 255, 255, 255, 190, 121, 77, 43, 55, 185, 255, 255, 255, 245, 137, 71, 43, 59, 139, 255, 255, 255, 255, 131, 66, 50, 66, 107, 194, 255, 255, 166, 116, 76, 55, 53, 125, 255, 255, 249, 247, 246, 245, 244, 234, 210, 202, 201, 200, 197, 174, 82, 59, 56, 55, 54, 46, 22, 12, 11, 10, 9, 7, 0, 64, 0, 128, 64, 0, 232, 158, 10, 0, 230, 0, 243, 221, 192, 181, 0, 171, 85, 0, 192, 128, 64, 0, 205, 154, 102, 51, 0, 213, 171, 128, 85, 43, 0, 224, 192, 160, 128, 96, 64, 32, 0, 100, 40, 16, 7, 3, 1, 0, 203, 150, 0, 215, 195, 166, 125, 110, 82, 0, 253, 250, 244, 233, 212, 182, 150, 131, 120, 110, 98, 85, 72, 60, 49, 40, 32, 25, 19, 15, 13, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 210, 208, 206, 203, 199, 193, 183, 168, 142, 104, 74, 52, 37, 27, 20, 14, 10, 6, 4, 2, 0, 223, 201, 183, 167, 152, 138, 124, 111, 98, 88, 79, 70, 62, 56, 50, 44, 39, 35, 31, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1, 0, 188, 176, 155, 138, 119, 97, 67, 43, 26, 10, 0, 165, 119, 80, 61, 47, 35, 27, 20, 14, 9, 4, 0, 113, 63, 0, 125, 51, 26, 18, 15, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 198, 105, 45, 22, 15, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 213, 162, 116, 83, 59, 43, 32, 24, 18, 15, 12, 9, 7, 6, 5, 3, 2, 0, 239, 187, 116, 59, 28, 16, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 250, 229, 188, 135, 86, 51, 30, 19, 13, 10, 8, 6, 5, 4, 3, 2, 1, 0, 249, 235, 213, 185, 156, 128, 103, 83, 66, 53, 42, 33, 26, 21, 17, 13, 10, 0, 254, 249, 235, 206, 164, 118, 77, 46, 27, 16, 10, 7, 5, 4, 3, 2, 1, 0, 255, 253, 249, 239, 220, 191, 156, 119, 85, 57, 37, 23, 15, 10, 6, 4, 2, 0, 255, 253, 251, 246, 237, 223, 203, 179, 152, 124, 98, 75, 55, 40, 29, 21, 15, 0, 255, 254, 253, 247, 220, 162, 106, 67, 42, 28, 18, 12, 9, 6, 4, 3, 2, 0, 31, 57, 107, 160, 205, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 69, 47, 67, 111, 166, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 82, 74, 79, 95, 109, 128, 145, 160, 173, 205, 205, 205, 224, 255, 255, 224, 255, 224, 125, 74, 59, 69, 97, 141, 182, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 173, 115, 85, 73, 76, 92, 115, 145, 173, 205, 224, 224, 255, 255, 255, 255, 255, 255, 166, 134, 113, 102, 101, 102, 107, 118, 125, 138, 145, 155, 166, 182, 192, 192, 205, 150, 224, 182, 134, 101, 83, 79, 85, 97, 120, 145, 173, 205, 224, 255, 255, 255, 255, 255, 255, 224, 192, 150, 120, 101, 92, 89, 93, 102, 118, 134, 160, 182, 192, 224, 224, 224, 255, 224, 224, 182, 155, 134, 118, 109, 104, 102, 106, 111, 118, 131, 145, 160, 173, 131, 241, 190, 178, 132, 87, 74, 41, 14, 0, 223, 193, 157, 140, 106, 57, 39, 18, 0, 131, 74, 141, 79, 80, 138, 95, 104, 134, 95, 99, 91, 125, 93, 76, 123, 115, 123, 128, 0, 214, 42, 0, 235, 128, 21, 0, 244, 184, 72, 11, 0, 248, 214, 128, 42, 7, 0, 248, 225, 170, 80, 25, 5, 0, 251, 236, 198, 126, 54, 18, 3, 0, 250, 238, 211, 159, 82, 35, 15, 5, 0, 250, 231, 203, 168, 128, 88, 53, 25, 6, 0, 252, 238, 216, 185, 148, 108, 71, 40, 18, 4, 0, 253, 243, 225, 199, 166, 128, 90, 57, 31, 13, 3, 0, 254, 246, 233, 212, 183, 147, 109, 73, 44, 23, 10, 2, 0, 255, 250, 240, 223, 198, 166, 128, 90, 58, 33, 16, 6, 1, 0, 255, 251, 244, 231, 210, 181, 146, 110, 75, 46, 25, 12, 5, 1, 0, 255, 253, 248, 238, 221, 196, 164, 128, 92, 60, 35, 18, 8, 3, 1, 0, 255, 253, 249, 242, 229, 208, 180, 146, 110, 76, 48, 27, 14, 7, 3, 1, 0, 129, 0, 207, 50, 0, 236, 129, 20, 0, 245, 185, 72, 10, 0, 249, 213, 129, 42, 6, 0, 250, 226, 169, 87, 27, 4, 0, 251, 233, 194, 130, 62, 20, 4, 0, 250, 236, 207, 160, 99, 47, 17, 3, 0, 255, 240, 217, 182, 131, 81, 41, 11, 1, 0, 255, 254, 233, 201, 159, 107, 61, 20, 2, 1, 0, 255, 249, 233, 206, 170, 128, 86, 50, 23, 7, 1, 0, 255, 250, 238, 217, 186, 148, 108, 70, 39, 18, 6, 1, 0, 255, 252, 243, 226, 200, 166, 128, 90, 56, 30, 13, 4, 1, 0, 255, 252, 245, 231, 209, 180, 146, 110, 76, 47, 25, 11, 4, 1, 0, 255, 253, 248, 237, 219, 194, 163, 128, 93, 62, 37, 19, 8, 3, 1, 0, 255, 254, 250, 241, 226, 205, 177, 145, 111, 79, 51, 30, 15, 6, 2, 1, 0, 129, 0, 203, 54, 0, 234, 129, 23, 0, 245, 184, 73, 10, 0, 250, 215, 129, 41, 5, 0, 252, 232, 173, 86, 24, 3, 0, 253, 240, 200, 129, 56, 15, 2, 0, 253, 244, 217, 164, 94, 38, 10, 1, 0, 253, 245, 226, 189, 132, 71, 27, 7, 1, 0, 253, 246, 231, 203, 159, 105, 56, 23, 6, 1, 0, 255, 248, 235, 213, 179, 133, 85, 47, 19, 5, 1, 0, 255, 254, 243, 221, 194, 159, 117, 70, 37, 12, 2, 1, 0, 255, 254, 248, 234, 208, 171, 128, 85, 48, 22, 8, 2, 1, 0, 255, 254, 250, 240, 220, 189, 149, 107, 67, 36, 16, 6, 2, 1, 0, 255, 254, 251, 243, 227, 201, 166, 128, 90, 55, 29, 13, 5, 2, 1, 0, 255, 254, 252, 246, 234, 213, 183, 147, 109, 73, 43, 22, 10, 4, 2, 1, 0, 130, 0, 200, 58, 0, 231, 130, 26, 0, 244, 184, 76, 12, 0, 249, 214, 130, 43, 6, 0, 252, 232, 173, 87, 24, 3, 0, 253, 241, 203, 131, 56, 14, 2, 0, 254, 246, 221, 167, 94, 35, 8, 1, 0, 254, 249, 232, 193, 130, 65, 23, 5, 1, 0, 255, 251, 239, 211, 162, 99, 45, 15, 4, 1, 0, 255, 251, 243, 223, 186, 131, 74, 33, 11, 3, 1, 0, 255, 252, 245, 230, 202, 158, 105, 57, 24, 8, 2, 1, 0, 255, 253, 247, 235, 214, 179, 132, 84, 44, 19, 7, 2, 1, 0, 255, 254, 250, 240, 223, 196, 159, 112, 69, 36, 15, 6, 2, 1, 0, 255, 254, 253, 245, 231, 209, 176, 136, 93, 55, 27, 11, 3, 2, 1, 0, 255, 254, 253, 252, 239, 221, 194, 158, 117, 76, 42, 18, 4, 3, 2, 1, 0, 0, 0, 2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104, 119, 135, 254, 49, 67, 77, 82, 93, 99, 198, 11, 18, 24, 31, 36, 45, 255, 46, 66, 78, 87, 94, 104, 208, 14, 21, 32, 42, 51, 66, 255, 94, 104, 109, 112, 115, 118, 248, 53, 69, 80, 88, 95, 102, 0, 15, 8, 7, 4, 11, 12, 3, 2, 13, 10, 5, 6, 9, 14, 1, 0, 9, 6, 3, 4, 5, 8, 1, 2, 7, 0, 1, 0, 0, 0, 1, 0, 0, 1, 255, 1, 255, 2, 254, 2, 254, 3, 253, 0, 1, 0, 1, 255, 2, 255, 2, 254, 3, 254, 3, 253, 7, 254, 7, 0, 2, 255, 255, 255, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 255, 2, 1, 0, 1, 1, 0, 0, 255, 255, 0, 0, 1, 255, 0, 1, 255, 0, 255, 1, 254, 2, 254, 254, 2, 253, 2, 3, 253, 252, 3, 252, 4, 4, 251, 5, 250, 251, 6, 249, 6, 5, 8, 247, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 255, 1, 0, 0, 1, 255, 0, 1, 255, 255, 1, 255, 2, 1, 255, 2, 254, 254, 2, 254, 2, 2, 3, 253, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 255, 1, 0, 0, 2, 1, 255, 2, 255, 255, 2, 255, 2, 2, 255, 3, 254, 254, 254, 3, 0, 1, 0, 0, 1, 0, 1, 255, 2, 255, 2, 255, 2, 3, 254, 3, 254, 254, 4, 4, 253, 5, 253, 252, 6, 252, 6, 5, 251, 8, 250, 251, 249, 9, 251, 8, 255, 6, 255, 6, 252, 10, 250, 10, 254, 6, 255, 6, 251, 10, 247, 12, 253, 7, 254, 7, 249, 13, 16, 24, 34, 6, 0, 3, 0, 7, 3, 0, 1, 10, 0, 2, 6, 18, 10, 12, 4, 0, 2, 0, 0, 0, 9, 4, 7, 4, 0, 3, 12, 7, 7, 120, 0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE + 30720);
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
Module["_memset"] = _memset;
var _BDtoILow = true;
Module["_bitshift64Shl"] = _bitshift64Shl;

function _abort() {
	Module["abort"]()
}
var _sqrtf = Math_sqrt;
Module["_i64Add"] = _i64Add;
var _fabs = Math_abs;
var _floor = Math_floor;
var _sqrt = Math_sqrt;
var _sin = Math_sin;
Module["_bitshift64Ashr"] = _bitshift64Ashr;
Module["_bitshift64Lshr"] = _bitshift64Lshr;
var _llvm_ctlz_i32 = true;
var _BDtoIHigh = true;
var _floorf = Math_floor;
var _log = Math_log;

function _emscripten_memcpy_big(dest, src, num) {
	HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
	return dest
}
Module["_memcpy"] = _memcpy;

function _llvm_stackrestore(p) {
	var self = _llvm_stacksave;
	var ret = self.LLVM_SAVEDSTACKS[p];
	self.LLVM_SAVEDSTACKS.splice(p, 1);
	Runtime.stackRestore(ret)
}
var _cos = Math_cos;
var _llvm_pow_f64 = Math_pow;

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

function _llvm_stacksave() {
	var self = _llvm_stacksave;
	if (!self.LLVM_SAVEDSTACKS) {
		self.LLVM_SAVEDSTACKS = []
	}
	self.LLVM_SAVEDSTACKS.push(Runtime.stackSave());
	return self.LLVM_SAVEDSTACKS.length - 1
}
Module["_memmove"] = _memmove;
var _BItoD = true;
var _atan2 = Math_atan2;
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

function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
	try {
		Module["dynCall_viiiiiii"](index, a1, a2, a3, a4, a5, a6, a7)
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
	"invoke_viiiiiii": invoke_viiiiiii,
	"_fabs": _fabs,
	"_floor": _floor,
	"_log": _log,
	"_sin": _sin,
	"_exp": _exp,
	"_llvm_pow_f64": _llvm_pow_f64,
	"_cos": _cos,
	"_pthread_self": _pthread_self,
	"_llvm_stacksave": _llvm_stacksave,
	"___setErrNo": ___setErrNo,
	"_fabsf": _fabsf,
	"_sbrk": _sbrk,
	"_time": _time,
	"_atan2": _atan2,
	"_floorf": _floorf,
	"_emscripten_memcpy_big": _emscripten_memcpy_big,
	"_sqrtf": _sqrtf,
	"_sqrt": _sqrt,
	"_abort": _abort,
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
	var ea = env.invoke_viiiiiii;
	var fa = env._fabs;
	var ga = env._floor;
	var ha = env._log;
	var ia = env._sin;
	var ja = env._exp;
	var ka = env._llvm_pow_f64;
	var la = env._cos;
	var ma = env._pthread_self;
	var na = env._llvm_stacksave;
	var oa = env.___setErrNo;
	var pa = env._fabsf;
	var qa = env._sbrk;
	var ra = env._time;
	var sa = env._atan2;
	var ta = env._floorf;
	var ua = env._emscripten_memcpy_big;
	var va = env._sqrtf;
	var wa = env._sqrt;
	var xa = env._abort;
	var ya = env._llvm_stackrestore;
	var za = env._sysconf;
	var Aa = 0.0;
	// EMSCRIPTEN_START_FUNCS
	function Da(a) {
		a = a | 0;
		var b = 0;
		b = i;
		i = i + a | 0;
		i = i + 15 & -16;
		return b | 0
	}

	function Ea() {
		return i | 0
	}

	function Fa(a) {
		a = a | 0;
		i = a
	}

	function Ga(a, b) {
		a = a | 0;
		b = b | 0;
		i = a;
		j = b
	}

	function Ha(a, b) {
		a = a | 0;
		b = b | 0;
		if (!n) {
			n = a;
			o = b
		}
	}

	function Ia(b) {
		b = b | 0;
		a[k >> 0] = a[b >> 0];
		a[k + 1 >> 0] = a[b + 1 >> 0];
		a[k + 2 >> 0] = a[b + 2 >> 0];
		a[k + 3 >> 0] = a[b + 3 >> 0]
	}

	function Ja(b) {
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

	function Ka(a) {
		a = a | 0;
		C = a
	}

	function La() {
		return C | 0
	}

	function Ma(a, d, e, f, h, i) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0,
			s = 0,
			t = 0.0;
		r = c[a + 44 >> 2] << i;
		s = c[a + 32 >> 2] | 0;
		l = a + 8 | 0;
		n = 0;
		do {
			m = _(n, r) | 0;
			o = 0;
			while (1) {
				if ((o | 0) >= (f | 0)) break;
				k = b[s + (o << 1) >> 1] | 0;
				a = m + (k << i) | 0;
				j = o + 1 | 0;
				k = (b[s + (j << 1) >> 1] | 0) - k << i;
				p = 0;
				q = 0.0;
				while (1) {
					if ((p | 0) >= (k | 0)) break;
					t = +g[d + (a + p << 2) >> 2];
					p = p + 1 | 0;
					q = q + t * t
				}
				q = +O(+(q + 1.0000000272452012e-27));
				g[e + (o + (_(n, c[l >> 2] | 0) | 0) << 2) >> 2] = q;
				o = j
			}
			n = n + 1 | 0
		} while ((n | 0) < (h | 0));
		return
	}

	function Na(a, b, c) {
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

	function Oa(d, e, f, h, j, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z) {
		d = d | 0;
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
			I = 0.0,
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
			ya = 0.0;
		xa = i;
		i = i + 96 | 0;
		oa = xa + 84 | 0;
		na = xa + 80 | 0;
		pa = xa + 76 | 0;
		qa = xa + 72 | 0;
		va = xa + 48 | 0;
		ua = xa;
		ta = (j | 0) != 0 ? 2 : 1;
		ha = (o | 0) == 0 ? 1 : 1 << w;
		ja = c[d + 32 >> 2] | 0;
		ka = b[ja + (e << 1) >> 1] << w;
		P = d + 8 | 0;
		ma = (_(ta, (b[ja + ((c[P >> 2] | 0) + -1 << 1) >> 1] << w) - ka | 0) | 0) << 2;
		la = i;
		i = i + ((1 * ma | 0) + 15 & -16) | 0;
		ma = la;
		P = b[ja + ((c[P >> 2] | 0) + -1 << 1) >> 1] << w;
		ia = P - ka | 0;
		c[ua + 32 >> 2] = m;
		fa = ua + 24 | 0;
		c[fa >> 2] = v;
		c[ua >> 2] = 1;
		c[ua + 12 >> 2] = r;
		c[ua + 4 >> 2] = d;
		ga = ua + 36 | 0;
		c[ga >> 2] = c[y >> 2];
		c[ua + 16 >> 2] = p;
		c[ua + 40 >> 2] = z;
		ba = ua + 8 | 0;
		ca = f + -1 | 0;
		da = (j | 0) == 0;
		ea = v + 20 | 0;
		X = v + 28 | 0;
		Y = ua + 28 | 0;
		Z = x + -1 | 0;
		$ = ua + 20 | 0;
		Q = d + 12 | 0;
		R = (1 << ha) + -1 | 0;
		S = va + 4 | 0;
		T = va + 8 | 0;
		U = va + 12 | 0;
		V = va + 16 | 0;
		W = va + 20 | 0;
		z = h + (P << 2) | 0;
		P = e;
		while (1) {
			if ((P | 0) >= (f | 0)) break;
			c[ba >> 2] = P;
			o = (P | 0) == (ca | 0);
			D = ja + (P << 1) | 0;
			K = b[D >> 1] << w;
			d = h + (K << 2) | 0;
			v = da ? 0 : j + (K << 2) | 0;
			M = P + 1 | 0;
			K = (b[ja + (M << 1) >> 1] << w) - K | 0;
			L = c[X >> 2] | 0;
			p = 32 - (aa(L | 0) | 0) | 0;
			L = L >>> (p + -16 | 0);
			N = (L >>> 12) + -8 | 0;
			N = (c[ea >> 2] << 3) - ((p << 3) + (N + (L >>> 0 > (c[10984 + (N << 2) >> 2] | 0) >>> 0 & 1))) | 0;
			L = (P | 0) == (e | 0) ? u : u - N | 0;
			u = t - N | 0;
			c[Y >> 2] = u + -1;
			if ((P | 0) <= (Z | 0) ? (ra = x - P | 0, ra = (c[n + (P << 2) >> 2] | 0) + ((L | 0) / (((ra | 0) > 3 ? 3 : ra) | 0) | 0) | 0, sa = (u | 0) < (ra | 0), !(((sa ? u : ra) | 0) <= 16383 & ((sa ? u : ra) | 0) < 0)) : 0) u = ((sa ? u : ra) | 0) > 16383 ? 16383 : sa ? u : ra;
			else u = 0;
			c[$ >> 2] = c[s + (P << 2) >> 2];
			E = (P | 0) < (c[Q >> 2] | 0);
			d = E ? d : ma;
			p = E ? v : da ? v : ma;
			z = o ? 0 : E ? z : 0;
			do
				if ((q | 0) == 0 | (P | 0) == (r | 0)) {
					E = p;
					if (!p) {
						if (o) q = 0;
						else q = la + ((b[D >> 1] << w) - ka << 2) | 0;
						d = Pa(ua, d, K, u, ha, 0, w, q, 1.0, z, R) | 0;
						q = 0;
						u = d;
						break
					}
					if (o) G = 0;
					else G = la + ((b[D >> 1] << w) - ka << 2) | 0;
					c[oa >> 2] = d;
					c[na >> 2] = p;
					c[pa >> 2] = u;
					c[qa >> 2] = R;
					H = (c[ua >> 2] | 0) == 0;
					F = c[fa >> 2] | 0;
					v = d;
					a: do
						if ((K | 0) != 1) {
							Ua(ua, va, v, E, K, pa, ha, ha, w, 1, qa);
							J = c[va >> 2] | 0;
							D = c[V >> 2] | 0;
							m = c[W >> 2] | 0;
							I = +(c[S >> 2] | 0) * .000030517578125;
							C = +(c[T >> 2] | 0) * .000030517578125;
							o = (K | 0) == 2;
							b: do
								if (!o) {
									d = c[pa >> 2] | 0;
									q = (d - (c[U >> 2] | 0) | 0) / 2 | 0;
									u = (d | 0) < (q | 0);
									q = ((u ? d : q) | 0) < 0 ? 0 : u ? d : q;
									d = d - q | 0;
									u = (c[Y >> 2] | 0) - m | 0;
									c[Y >> 2] = u;
									if ((q | 0) < (d | 0)) {
										p = c[qa >> 2] | 0;
										E = Pa(ua, E, K, d, ha, 0, w, 0, C, 0, p >> ha) | 0;
										d = d + ((c[Y >> 2] | 0) - u) | 0;
										d = E | (Pa(ua, v, K, (d | 0) <= 24 | (D | 0) == 16384 ? q : q + (d + -24) | 0, ha, 0, w, G, 1.0, z, p) | 0)
									} else {
										p = c[qa >> 2] | 0;
										v = Pa(ua, v, K, q, ha, 0, w, G, 1.0, z, p) | 0;
										u = q + ((c[Y >> 2] | 0) - u) | 0;
										d = v | (Pa(ua, E, K, (u | 0) <= 24 | (D | 0) == 0 ? d : d + (u + -24) | 0, ha, 0, w, 0, C, 0, p >> ha) | 0)
									}
									if (!H) break a;
									if (!o) {
										p = c[oa >> 2] | 0;
										m = c[na >> 2] | 0;
										D = m;
										o = p;
										q = 0;
										u = 0;
										v = 0;
										while (1) {
											B = (c[k >> 2] = u, +g[k >> 2]);
											if ((q | 0) >= (K | 0)) break;
											A = +g[D + (q << 2) >> 2];
											u = (g[k >> 2] = B + A * +g[o + (q << 2) >> 2], c[k >> 2] | 0);
											q = q + 1 | 0;
											v = (g[k >> 2] = (c[k >> 2] = v, +g[k >> 2]) + A * A, c[k >> 2] | 0)
										}
										C = I * B;
										B = I * I + (c[k >> 2] = v, +g[k >> 2]);
										A = B - C * 2.0;
										C = B + C * 2.0;
										if (C < 6.000000284984708e-04 | A < 6.000000284984708e-04) {
											nd(m | 0, p | 0, K << 2 | 0) | 0;
											break
										}
										B = 1.0 / +O(+A);
										A = 1.0 / +O(+C);
										u = 0;
										while (1) {
											if ((u | 0) >= (K | 0)) break b;
											v = o + (u << 2) | 0;
											ya = I * +g[v >> 2];
											q = D + (u << 2) | 0;
											C = +g[q >> 2];
											g[v >> 2] = B * (ya - C);
											g[q >> 2] = A * (ya + C);
											u = u + 1 | 0
										}
									}
								} else {
									u = c[pa >> 2] | 0;
									c: do
										if ((D | 0) < 16384) {
											switch (D | 0) {
												case 0:
													break;
												default:
													{
														wa = 20;
														break c
													}
											}
											c[Y >> 2] = (c[Y >> 2] | 0) - m;
											q = c[na >> 2] | 0;
											v = 0;
											p = d
										} else {
											switch (D | 0) {
												case 16384:
													break;
												default:
													{
														wa = 20;
														break c
													}
											}
											c[Y >> 2] = (c[Y >> 2] | 0) - m;
											q = c[oa >> 2] | 0;
											v = 0
										}
									while (0);
									do
										if ((wa | 0) == 20) {
											wa = 0;
											u = u - 8 | 0;
											v = (D | 0) > 8192;
											c[Y >> 2] = (c[Y >> 2] | 0) - (m + 8);
											q = v ? c[oa >> 2] | 0 : c[na >> 2] | 0;
											p = v ? p : d;
											if (H) {
												v = eb(F, 1) | 0;
												break
											} else {
												d = p;
												v = q;
												v = +g[d >> 2] * +g[v + 4 >> 2] - +g[d + 4 >> 2] * +g[v >> 2] < 0.0 & 1;
												jb(F, v, 1);
												break
											}
										}
									while (0);
									E = 1 - (v << 1) | 0;
									v = p;
									d = Pa(ua, v, 2, u, ha, 0, w, G, 1.0, z, R) | 0;
									u = q;
									g[u >> 2] = +(0 - E | 0) * +g[v + 4 >> 2];
									g[u + 4 >> 2] = +(E | 0) * +g[v >> 2];
									if (!H) break a;
									u = c[oa >> 2] | 0;
									g[u >> 2] = I * +g[u >> 2];
									u = (c[oa >> 2] | 0) + 4 | 0;
									g[u >> 2] = I * +g[u >> 2];
									u = c[na >> 2] | 0;
									g[u >> 2] = C * +g[u >> 2];
									u = (c[na >> 2] | 0) + 4 | 0;
									g[u >> 2] = C * +g[u >> 2];
									u = c[oa >> 2] | 0;
									A = +g[u >> 2];
									g[u >> 2] = A - +g[c[na >> 2] >> 2];
									u = c[na >> 2] | 0;
									g[u >> 2] = A + +g[u >> 2];
									u = (c[oa >> 2] | 0) + 4 | 0;
									A = +g[u >> 2];
									g[u >> 2] = A - +g[(c[na >> 2] | 0) + 4 >> 2];
									u = (c[na >> 2] | 0) + 4 | 0;
									g[u >> 2] = A + +g[u >> 2]
								}
							while (0);
							if (J) {
								q = 0;
								while (1) {
									if ((q | 0) >= (K | 0)) break a;
									u = (c[na >> 2] | 0) + (q << 2) | 0;
									g[u >> 2] = - +g[u >> 2];
									q = q + 1 | 0
								}
							}
						} else {
							Qa(ua, v, E, u, G);
							d = 1
						}
					while (0);
					q = 0;
					u = d
				} else {
					m = (u | 0) / 2 | 0;
					if (o) {
						E = z;
						u = 0;
						v = E;
						d = Pa(ua, d, K, m, ha, 0, w, 0, 1.0, E, R) | 0
					} else {
						v = z;
						d = Pa(ua, d, K, m, ha, 0, w, la + ((b[D >> 1] << w) - ka << 2) | 0, 1.0, v, R) | 0;
						u = la + (ia + ((b[D >> 1] << w) - ka) << 2) | 0
					}
					u = Pa(ua, p, K, m, ha, 0, w, u, 1.0, v, R) | 0
				}
			while (0);
			v = _(P, ta) | 0;
			a[l + v >> 0] = d;
			a[l + (v + ta + -1) >> 0] = u;
			u = L + ((c[n + (P << 2) >> 2] | 0) + N) | 0;
			P = M
		}
		c[y >> 2] = c[ga >> 2];
		i = xa;
		return
	}

	function Pa(a, b, e, f, h, i, j, k, l, m, n) {
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
			Qa(a, b, 0, f, k);
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
				nd(m | 0, i | 0, e << 2 | 0) | 0
			}
		while (0);
		r = q;
		i = (q | 0) == 0;
		q = 0;
		while (1) {
			if ((q | 0) >= (v | 0)) break;
			if (!t) Na(b, e >> q, 1 << q);
			if (!i) Na(r, e >> q, 1 << q);
			n = d[31370 + (n & 15) >> 0] | 0 | (d[31370 + (n >> 4) >> 0] | 0) << 2;
			q = q + 1 | 0
		}
		q = h >> v;
		m = n;
		n = s << v;
		h = 0;
		while (1) {
			if (!((n & 1 | 0) == 0 & (p | 0) < 0)) break;
			if (!t) Na(b, n, q);
			if (!i) Na(r, n, q);
			s = m | m << q;
			q = q << 1;
			m = s;
			n = n >> 1;
			p = p + 1 | 0;
			h = h + 1 | 0
		}
		o = (q | 0) > 1;
		if (o) {
			if (!t) Ra(b, n >> v, q << v, u);
			if (!i) Ra(r, n >> v, q << v, u)
		}
		p = Sa(a, b, e, f, q, r, j, l, m) | 0;
		if (!t) {
			j = p;
			return j | 0
		}
		if (o) {
			Ta(b, n >> v, q << v, u);
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
			Na(b, s, j);
			q = j;
			n = s;
			p = p | p >>> j;
			o = o + 1 | 0
		}
		while (1) {
			if ((o | 0) >= (v | 0)) break;
			j = d[31386 + n >> 0] | 0;
			Na(b, e >> o, 1 << o);
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

	function Qa(a, b, d, e, f) {
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
				if (l) a = eb(j, 1) | 0;
				else {
					a = +g[i >> 2] < 0.0 & 1;
					jb(j, a, 1)
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

	function Ra(a, b, d, e) {
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
			nd(a | 0, k | 0, e | 0) | 0;
			i = l;
			return
		}
		g = d + -2 | 0;
		e = 0;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			f = 5512 + (g + e << 2) | 0;
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
		nd(a | 0, k | 0, d | 0) | 0;
		i = l;
		return
	}

	function Sa(e, f, h, j, k, l, m, n, o) {
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
			Ua(e, p, f, y, x, A, u, k, z, 0, G);
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
				F = (Sa(e, y, x, t, u, s, z, q * n, h >> u) | 0) << (k >> 1);
				o = t + ((c[j >> 2] | 0) - r) | 0;
				e = F | (Sa(e, f, x, (o | 0) <= 24 | (v | 0) == 16384 ? p : p + (o + -24) | 0, u, l, z, w * n, h) | 0);
				i = H;
				return e | 0
			} else {
				h = c[G >> 2] | 0;
				F = Sa(e, f, x, p, u, l, z, w * n, h) | 0;
				o = p + ((c[j >> 2] | 0) - r) | 0;
				e = F | (Sa(e, y, x, (o | 0) <= 24 | (v | 0) == 0 ? t : t + (o + -24) | 0, u, s, z, q * n, h >> u) | 0) << (k >> 1);
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
				e = yb(f, h, p, F, k, r, n) | 0;
				i = H;
				return e | 0
			} else {
				e = xb(f, h, p, F, k, r) | 0;
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
			id(f | 0, 0, h << 2 | 0) | 0;
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

	function Ta(a, b, d, e) {
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
			nd(a | 0, k | 0, e | 0) | 0;
			i = l;
			return
		}
		g = d + -2 | 0;
		e = 0;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			f = 5512 + (g + e << 2) | 0;
			h = 0;
			while (1) {
				if ((h | 0) >= (b | 0)) break;
				c[k + ((_(h, d) | 0) + e << 2) >> 2] = c[a + ((_(c[f >> 2] | 0, b) | 0) + h << 2) >> 2];
				h = h + 1 | 0
			}
			e = e + 1 | 0
		}
		e = j << 2;
		nd(a | 0, k | 0, e | 0) | 0;
		i = l;
		return
	}

	function Ua(a, d, e, f, h, i, j, k, l, m, n) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		j = j | 0;
		k = k | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		var o = 0,
			p = 0,
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
			J = 0,
			K = 0.0,
			L = 0.0,
			N = 0.0;
		o = c[a >> 2] | 0;
		F = c[a + 8 >> 2] | 0;
		u = c[a + 12 >> 2] | 0;
		r = c[a + 24 >> 2] | 0;
		D = c[a + 32 >> 2] | 0;
		E = c[a + 4 >> 2] | 0;
		p = (b[(c[E + 56 >> 2] | 0) + (F << 1) >> 1] | 0) + (l << 3) | 0;
		l = p >> 1;
		C = (m | 0) == 0;
		if (C) {
			l = l - 4 | 0;
			q = c[i >> 2] | 0;
			m = (h << 1) + -1 | 0
		} else {
			m = h << 1;
			l = l - ((h | 0) == 2 ? 16 : 4) | 0;
			q = c[i >> 2] | 0;
			m = (h | 0) == 2 ? m + -2 | 0 : m + -1 | 0
		}
		l = (q + (_(m, l) | 0) | 0) / (m | 0) | 0;
		B = q - p + -32 | 0;
		l = (B | 0) < (l | 0) ? B : l;
		if ((l | 0) <= 64)
			if ((l | 0) < 4) l = 1;
			else z = 6;
		else {
			l = 64;
			z = 6
		}
		if ((z | 0) == 6) l = (b[28528 + ((l & 7) << 1) >> 1] >> 14 - (l >> 3)) + 1 & -2;
		B = C | (F | 0) < (u | 0) ? l : 1;
		y = (o | 0) == 0;
		if (y) p = 0;
		else {
			a: do
				if (C) {
					l = 0;
					t = 0.0;
					while (1) {
						if ((l | 0) >= (h | 0)) {
							l = 0;
							s = 0.0;
							break
						}
						s = +g[e + (l << 2) >> 2];
						l = l + 1 | 0;
						t = t + s * s
					}
					while (1) {
						if ((l | 0) >= (h | 0)) break;
						K = +g[f + (l << 2) >> 2];
						l = l + 1 | 0;
						s = s + K * K
					}
					t = t + 1.0000000036274937e-15;
					s = s + 1.0000000036274937e-15
				} else {
					t = 1.0000000036274937e-15;
					s = 1.0000000036274937e-15;
					l = 0;
					while (1) {
						if ((l | 0) >= (h | 0)) break a;
						N = +g[e + (l << 2) >> 2];
						K = +g[f + (l << 2) >> 2];
						L = N + K;
						K = N - K;
						t = t + L * L;
						s = s + K * K;
						l = l + 1 | 0
					}
				}while (0);p = ~~+M(+(+W(+(+O(+s)), +(+O(+t))) * 10430.3818359375 + .5))
		}
		A = r;
		H = A + 20 | 0;
		I = c[H >> 2] << 3;
		J = A + 28 | 0;
		x = c[J >> 2] | 0;
		w = 32 - (aa(x | 0) | 0) | 0;
		o = x >>> (w + -16 | 0);
		G = (o >>> 12) + -8 | 0;
		G = (w << 3) + (G + (o >>> 0 > (c[10984 + (G << 2) >> 2] | 0) >>> 0 & 1)) | 0;
		b: do
			if ((B | 0) == 1)
				if (!C) {
					if (y) u = 0;
					else {
						C = (p | 0) > 8192;
						m = C & 1;
						c: do
							if (C) {
								l = 0;
								while (1) {
									if ((l | 0) >= (h | 0)) break c;
									C = f + (l << 2) | 0;
									g[C >> 2] = - +g[C >> 2];
									l = l + 1 | 0
								}
							}
						while (0);
						Va(E, e, f, D, F, h);
						q = c[i >> 2] | 0;
						u = m
					}
					if ((q | 0) > 16 ? (c[a + 28 >> 2] | 0) > 16 : 0) {
						l = c[J >> 2] | 0;
						if (y) {
							p = A + 32 | 0;
							q = c[p >> 2] | 0;
							o = l >>> 2;
							m = q >>> 0 < o >>> 0;
							if (!m) {
								c[p >> 2] = q - o;
								o = l - o | 0
							}
							c[J >> 2] = o;
							fb(A);
							m = m & 1;
							p = 0;
							break
						}
						m = l >>> 2;
						p = l - m | 0;
						if (!u) l = r + 32 | 0;
						else {
							l = r + 32 | 0;
							c[l >> 2] = (c[A + 32 >> 2] | 0) + p;
							p = m
						}
						q = r + 28 | 0;
						c[q >> 2] = p;
						o = r + 20 | 0;
						while (1) {
							if (p >>> 0 >= 8388609) {
								m = u;
								p = 0;
								break b
							}
							lb(r, (c[l >> 2] | 0) >>> 23);
							c[l >> 2] = c[l >> 2] << 8 & 2147483392;
							p = c[q >> 2] << 8;
							c[q >> 2] = p;
							c[o >> 2] = (c[o >> 2] | 0) + 8
						}
					} else {
						m = 0;
						p = 0
					}
				} else m = 0;
		else {
			if (!y) p = (_(p, B) | 0) + 8192 >> 14;
			do
				if ((C ^ 1) & (h | 0) > 2) {
					u = (B | 0) / 2 | 0;
					v = (u * 3 | 0) + 3 + u | 0;
					if (y) {
						l = (x >>> 0) / (v >>> 0) | 0;
						c[A + 36 >> 2] = l;
						m = A + 32 | 0;
						q = c[m >> 2] | 0;
						p = ((q >>> 0) / (l >>> 0) | 0) + 1 | 0;
						p = v - (v >>> 0 < p >>> 0 ? v : p) | 0;
						e = u + 1 | 0;
						r = e * 3 | 0;
						p = (p | 0) < (r | 0) ? (p | 0) / 3 | 0 : e + (p - r) | 0;
						if ((p | 0) > (u | 0)) {
							o = p - u + r | 0;
							r = p + -1 - u + r | 0
						} else {
							o = (p * 3 | 0) + 3 | 0;
							r = p * 3 | 0
						}
						e = _(l, v - o | 0) | 0;
						c[m >> 2] = q - e;
						z = _(l, o - r | 0) | 0;
						c[J >> 2] = (r | 0) == 0 ? x - e | 0 : z;
						fb(A);
						z = 48;
						break
					} else {
						if ((p | 0) > (u | 0)) {
							l = p + -1 - u + ((u * 3 | 0) + 3) | 0;
							r = p - u + ((u * 3 | 0) + 3) | 0
						} else {
							l = p * 3 | 0;
							r = (p * 3 | 0) + 3 | 0
						}
						gb(A, l, r, v);
						z = 47;
						break
					}
				} else {
					if ((k | 0) > 1 | C ^ 1) {
						r = B + 1 | 0;
						if (y) {
							p = db(A, r) | 0;
							z = 48;
							break
						} else {
							ib(A, p, r);
							z = 47;
							break
						}
					}
					r = B >> 1;
					l = r + 1 | 0;
					a = _(l, l) | 0;
					if (!y) {
						if ((p | 0) > (r | 0)) {
							r = B + 1 - p | 0;
							l = a - ((_(B + 1 - p | 0, B + 2 - p | 0) | 0) >> 1) | 0
						} else {
							r = p + 1 | 0;
							l = (_(p, p + 1 | 0) | 0) >> 1
						}
						gb(A, l, l + r | 0, a);
						z = 47;
						break
					}
					o = (x >>> 0) / (a >>> 0) | 0;
					c[A + 36 >> 2] = o;
					k = A + 32 | 0;
					w = c[k >> 2] | 0;
					m = ((w >>> 0) / (o >>> 0) | 0) + 1 | 0;
					m = a >>> 0 < m >>> 0 ? a : m;
					u = a - m | 0;
					if ((u | 0) < ((_(r, l) | 0) >> 1 | 0)) {
						u = u << 3 | 1;
						q = 32 - (aa(u | 0) | 0) + -1 >> 1;
						m = 1 << q;
						p = 0;
						while (1) {
							r = (p << 1) + m << q;
							l = u >>> 0 < r >>> 0;
							p = l ? p : p + m | 0;
							if ((q | 0) <= 0) break;
							else {
								u = l ? u : u - r | 0;
								m = m >>> 1;
								q = q + -1 | 0
							}
						}
						p = (p + -1 | 0) >>> 1;
						l = p + 1 | 0;
						u = l;
						r = p;
						l = (_(p, l) | 0) >>> 1
					} else {
						p = B << 1;
						u = (m << 3) + -7 | 0;
						m = 32 - (aa(u | 0) | 0) + -1 >> 1;
						l = 1 << m;
						q = 0;
						while (1) {
							v = (q << 1) + l << m;
							r = u >>> 0 < v >>> 0;
							q = r ? q : q + l | 0;
							if ((m | 0) <= 0) break;
							else {
								u = r ? u : u - v | 0;
								l = l >>> 1;
								m = m + -1 | 0
							}
						}
						l = (p + 2 - q | 0) >>> 1;
						p = B + 1 - l | 0;
						u = p;
						r = l;
						l = a - ((_(p, B + 2 - l | 0) | 0) >> 1) | 0
					}
					a = _(o, a - (l + u) | 0) | 0;
					c[k >> 2] = w - a;
					p = _(o, u) | 0;
					c[J >> 2] = (l | 0) == 0 ? x - a | 0 : p;
					fb(A);
					p = (r << 14 >>> 0) / (B >>> 0) | 0;
					if (y) {
						m = 0;
						break b
					}
				}
			while (0);
			if ((z | 0) == 47) p = (p << 14 >>> 0) / (B >>> 0) | 0;
			else if ((z | 0) == 48) {
				m = 0;
				p = (p << 14 >>> 0) / (B >>> 0) | 0;
				break
			}
			if (C) m = 0;
			else {
				if (!p) {
					Va(E, e, f, D, F, h);
					m = 0;
					p = 0;
					break
				} else o = 0;
				while (1) {
					if ((o | 0) >= (h | 0)) {
						m = 0;
						break b
					}
					E = e + (o << 2) | 0;
					s = +g[E >> 2] * .7071067690849304;
					F = f + (o << 2) | 0;
					t = +g[F >> 2] * .7071067690849304;
					g[E >> 2] = s + t;
					g[F >> 2] = t - s;
					o = o + 1 | 0
				}
			}
		}
		while (0);
		e = c[J >> 2] | 0;
		F = 32 - (aa(e | 0) | 0) | 0;
		e = e >>> (F + -16 | 0);
		o = (e >>> 12) + -8 | 0;
		o = (c[H >> 2] << 3) - ((F << 3) + (o + (e >>> 0 > (c[10984 + (o << 2) >> 2] | 0) >>> 0 & 1))) + (G - I) | 0;
		c[i >> 2] = (c[i >> 2] | 0) - o;
		d: do
			if ((p | 0) < 16384) {
				switch (p | 0) {
					case 0:
						break;
					default:
						break d
				}
				c[n >> 2] = c[n >> 2] & (1 << j) + -1;
				D = 32767;
				E = 0;
				F = -16384;
				c[d >> 2] = m;
				e = d + 4 | 0;
				c[e >> 2] = D;
				e = d + 8 | 0;
				c[e >> 2] = E;
				e = d + 12 | 0;
				c[e >> 2] = F;
				e = d + 16 | 0;
				c[e >> 2] = p;
				e = d + 20 | 0;
				c[e >> 2] = o;
				return
			} else {
				switch (p | 0) {
					case 16384:
						break;
					default:
						break d
				}
				c[n >> 2] = c[n >> 2] & (1 << j) + -1 << j;
				D = 0;
				E = 32767;
				F = 16384;
				c[d >> 2] = m;
				e = d + 4 | 0;
				c[e >> 2] = D;
				e = d + 8 | 0;
				c[e >> 2] = E;
				e = d + 12 | 0;
				c[e >> 2] = F;
				e = d + 16 | 0;
				c[e >> 2] = p;
				e = d + 20 | 0;
				c[e >> 2] = o;
				return
			}
		while (0);
		D = p << 16 >> 16;
		D = ((_(D, D) | 0) + 4096 | 0) >>> 13;
		E = D << 16 >> 16;
		D = (32767 - D + (((_(E, (((_(E, (((_(D << 16 >> 16, -626) | 0) + 16384 | 0) >>> 15 << 16) + 542441472 >> 16) | 0) + 16384 | 0) >>> 15 << 16) + -501415936 >> 16) | 0) + 16384 | 0) >>> 15) << 16) + 65536 >> 16;
		E = 16384 - p << 16 >> 16;
		E = ((_(E, E) | 0) + 4096 | 0) >>> 13;
		C = E << 16 >> 16;
		E = (32767 - E + (((_(C, (((_(C, (((_(E << 16 >> 16, -626) | 0) + 16384 | 0) >>> 15 << 16) + 542441472 >> 16) | 0) + 16384 | 0) >>> 15 << 16) + -501415936 >> 16) | 0) + 16384 | 0) >>> 15) << 16) + 65536 >> 16;
		C = 32 - (aa(D | 0) | 0) | 0;
		B = 32 - (aa(E | 0) | 0) | 0;
		e = E << 15 - B << 16 >> 16;
		F = D << 15 - C << 16 >> 16;
		F = (_((h << 23) + -8388608 >> 16, (B - C << 11) + (((_(e, (((_(e, -2597) | 0) + 16384 | 0) >>> 15 << 16) + 519831552 >> 16) | 0) + 16384 | 0) >>> 15) - (((_(F, (((_(F, -2597) | 0) + 16384 | 0) >>> 15 << 16) + 519831552 >> 16) | 0) + 16384 | 0) >>> 15) << 16 >> 16) | 0) + 16384 >> 15;
		c[d >> 2] = m;
		e = d + 4 | 0;
		c[e >> 2] = D;
		e = d + 8 | 0;
		c[e >> 2] = E;
		e = d + 12 | 0;
		c[e >> 2] = F;
		e = d + 16 | 0;
		c[e >> 2] = p;
		e = d + 20 | 0;
		c[e >> 2] = o;
		return
	}

	function Va(a, b, d, e, f, h) {
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

	function Wa(a, b, d, e, f, h, i, j, l, m, n, o) {
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
			od(a | 0, b | 0, f << 2 | 0) | 0;
			return
		}
		t = +g[5632 + (j * 12 | 0) >> 2] * h;
		u = +g[5632 + (j * 12 | 0) + 4 >> 2] * h;
		s = +g[5632 + (j * 12 | 0) + 8 >> 2] * h;
		y = +g[5632 + (l * 12 | 0) >> 2] * i;
		z = +g[5632 + (l * 12 | 0) + 4 >> 2] * i;
		A = +g[5632 + (l * 12 | 0) + 8 >> 2] * i;
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
			od(a + (o << 2) | 0, b + (o << 2) | 0, f - o << 2 | 0) | 0;
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

	function Xa(e, f, h, j, l, m) {
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		var n = 0,
			o = 0,
			p = 0,
			q = 0.0,
			r = 0.0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0,
			z = 0,
			A = 0.0,
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
			O = 0,
			P = 0.0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
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
			va = 0,
			wa = 0,
			xa = 0,
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
			Ka = 0,
			La = 0,
			Na = 0,
			Pa = 0,
			Qa = 0,
			Ra = 0,
			Sa = 0,
			Ta = 0,
			Ua = 0,
			Va = 0,
			Wa = 0,
			Xa = 0,
			Ya = 0,
			cb = 0,
			db = 0,
			eb = 0,
			fb = 0,
			ib = 0,
			mb = 0,
			nb = 0,
			ob = 0.0;
		nb = i;
		i = i + 192 | 0;
		K = nb + 88 | 0;
		D = nb + 36 | 0;
		n = nb + 40 | 0;
		Z = nb + 32 | 0;
		Xa = nb + 28 | 0;
		Wa = nb + 24 | 0;
		Pa = nb + 20 | 0;
		Na = nb + 16 | 0;
		ca = nb + 12 | 0;
		Ba = nb + 8 | 0;
		Aa = nb + 4 | 0;
		J = nb;
		eb = c[e + 4 >> 2] | 0;
		Va = c[e + 8 >> 2] | 0;
		c[Xa >> 2] = 15;
		g[Wa >> 2] = 0.0;
		c[Pa >> 2] = 0;
		c[ca >> 2] = 0;
		La = c[e >> 2] | 0;
		Ua = La + 8 | 0;
		mb = c[Ua >> 2] | 0;
		H = c[La + 4 >> 2] | 0;
		Da = La + 32 | 0;
		pa = c[Da >> 2] | 0;
		fb = c[e + 32 >> 2] | 0;
		ib = c[e + 36 >> 2] | 0;
		g[Ba >> 2] = 0.0;
		if ((l | 0) < 2 | (f | 0) == 0) {
			fa = -1;
			i = nb;
			return fa | 0
		}
		U = e + 28 | 0;
		o = _(c[U >> 2] | 0, h) | 0;
		la = La + 44 | 0;
		za = La + 36 | 0;
		p = c[za >> 2] | 0;
		Ka = 0;
		while (1) {
			if ((Ka | 0) > (p | 0)) {
				n = -1;
				ta = 403;
				break
			}
			if ((c[la >> 2] << Ka | 0) == (o | 0)) break;
			Ka = Ka + 1 | 0
		}
		if ((ta | 0) == 403) {
			i = nb;
			return n | 0
		}
		z = 1 << Ka;
		Ia = c[la >> 2] << Ka;
		G = e + 200 + ((_(eb, H) | 0) << 2) | 0;
		db = _(eb, H + 1024 | 0) | 0;
		Qa = e + 200 + (db << 2) | 0;
		Ta = _(eb, mb) | 0;
		Ya = db + Ta | 0;
		Ra = e + 200 + (Ya << 2) | 0;
		cb = Ya + Ta | 0;
		Sa = e + 200 + (cb << 2) | 0;
		s = (m | 0) == 0;
		if (s) {
			Fa = 0;
			E = 1
		} else {
			E = (c[m + 20 >> 2] | 0) + ((aa(c[m + 28 >> 2] | 0) | 0) + -32) | 0;
			Fa = E + 4 >> 3
		}
		h = (l | 0) < 1275 ? l : 1275;
		v = h - Fa | 0;
		oa = e + 44 | 0;
		l = c[e + 40 >> 2] | 0;
		if (c[oa >> 2] | 0)
			if ((l | 0) == -1) {
				l = -1;
				ta = 11
			} else {
				ta = c[La >> 2] | 0;
				ta = ((_(l, o) | 0) + (ta >> 4) | 0) / (ta >> 3 | 0) | 0;
				o = h;
				p = ta >> 6;
				h = ta;
				ta = 13
			}
		else ta = 11;
		if ((ta | 0) == 11) {
			p = _(l, o) | 0;
			if ((l | 0) == -1) {
				o = h;
				Ga = 51e4;
				p = h;
				Ea = 0
			} else {
				ta = c[La >> 2] | 0;
				p = (((ta << 2) + ((E | 0) > 1 ? p + E | 0 : p) | 0) / (ta << 3 | 0) | 0) - ((c[e + 48 >> 2] | 0) != 0 & 1) | 0;
				ta = (h | 0) < (p | 0);
				fa = ((ta ? h : p) | 0) < 2;
				o = fa ? 2 : ta ? h : p;
				p = fa ? 2 : ta ? h : p;
				h = 0;
				ta = 13
			}
		}
		if ((ta | 0) == 13) {
			Ga = l - (_((Va * 40 | 0) + 20 | 0, (400 >>> Ka) + -50 | 0) | 0) | 0;
			Ea = h
		}
		if (s) {
			c[n >> 2] = j;
			c[n + 8 >> 2] = 0;
			c[n + 12 >> 2] = 0;
			c[n + 16 >> 2] = 0;
			c[n + 20 >> 2] = 33;
			c[n + 24 >> 2] = 0;
			c[n + 28 >> 2] = -2147483648;
			c[n + 40 >> 2] = -1;
			c[n + 32 >> 2] = 0;
			c[n + 36 >> 2] = 0;
			c[n + 4 >> 2] = o;
			c[n + 44 >> 2] = 0;
			Ja = n
		} else Ja = m;
		xa = (Ea | 0) > 0;
		if (((xa ? (c[e + 52 >> 2] | 0) != 0 : 0) ? (t = (E | 0) == 1 ? 2 : 0, u = c[e + 164 >> 2] | 0, fa = (Ea << 1) - u >> 6, (((t | 0) > (fa | 0) ? t : fa) | 0) < (v | 0)) : 0) ? (w = (Ea << 1) - u >> 6, w = (t | 0) > (w | 0) ? t : w, (w | 0) < (v | 0)) : 0) {
			o = Fa + w | 0;
			ea = c[Ja >> 2] | 0;
			fa = c[Ja + 8 >> 2] | 0;
			l = Ja + 4 | 0;
			od(ea + (o - fa) | 0, ea + ((c[l >> 2] | 0) - fa) | 0, fa | 0) | 0;
			c[l >> 2] = o;
			l = w
		} else l = v;
		F = o << 3;
		ma = c[La + 12 >> 2] | 0;
		ma = (ib | 0) > (ma | 0) ? ma : ib;
		I = Ia + H | 0;
		y = _(eb, I) | 0;
		Ha = na() | 0;
		R = i;
		i = i + ((1 * (y << 2) | 0) + 15 & -16) | 0;
		y = e + 180 | 0;
		q = +g[y >> 2];
		v = _(Va, Ia - H | 0) | 0;
		w = c[U >> 2] | 0;
		v = (v | 0) / (w | 0) | 0;
		c[K >> 2] = 0;
		c[D >> 2] = 0;
		h = 0;
		m = 0;
		n = 0;
		while (1) {
			r = (c[k >> 2] = h, +g[k >> 2]);
			if ((n | 0) >= (v | 0)) break;
			s = f + (n << 2) | 0;
			h = c[(r > +g[s >> 2] ? K : s) >> 2] | 0;
			c[K >> 2] = h;
			m = c[((c[k >> 2] = m, +g[k >> 2]) < +g[s >> 2] ? D : s) >> 2] | 0;
			c[D >> 2] = m;
			n = n + 1 | 0
		}
		A = -(c[k >> 2] = m, +g[k >> 2]);
		if (!(q > (r > A ? r : A))) {
			c[K >> 2] = 0;
			c[D >> 2] = 0;
			h = 0;
			s = 0;
			n = 0;
			while (1) {
				r = (c[k >> 2] = h, +g[k >> 2]);
				if ((n | 0) >= (v | 0)) break;
				m = f + (n << 2) | 0;
				h = c[(r > +g[m >> 2] ? K : m) >> 2] | 0;
				c[K >> 2] = h;
				s = c[((c[k >> 2] = s, +g[k >> 2]) < +g[m >> 2] ? D : m) >> 2] | 0;
				c[D >> 2] = s;
				n = n + 1 | 0
			}
			q = -(c[k >> 2] = s, +g[k >> 2]);
			q = r > q ? r : q
		}
		m = (_(Va, H) | 0) / (w | 0) | 0;
		c[K >> 2] = 0;
		c[D >> 2] = 0;
		h = 0;
		n = 0;
		t = 0;
		while (1) {
			r = (c[k >> 2] = h, +g[k >> 2]);
			if ((t | 0) >= (m | 0)) break;
			s = f + (v + t << 2) | 0;
			h = c[(r > +g[s >> 2] ? K : s) >> 2] | 0;
			c[K >> 2] = h;
			n = c[((c[k >> 2] = n, +g[k >> 2]) < +g[s >> 2] ? D : s) >> 2] | 0;
			c[D >> 2] = n;
			t = t + 1 | 0
		}
		x = -(c[k >> 2] = n, +g[k >> 2]);
		x = r > x ? r : x;
		g[y >> 2] = x;
		x = q > x ? q : x;
		ka = e + 60 | 0;
		v = x <= 1.0 / +(1 << c[ka >> 2] | 0);
		j = v & 1;
		if ((E | 0) == 1) {
			w = Ja + 28 | 0;
			n = c[w >> 2] | 0;
			m = n >>> 15;
			n = n - m | 0;
			h = Ja + 32 | 0;
			if (v) {
				fa = Ja + 32 | 0;
				c[fa >> 2] = (c[h >> 2] | 0) + n;
				h = fa
			} else m = n;
			s = Ja + 28 | 0;
			c[s >> 2] = m;
			n = Ja + 20 | 0;
			while (1) {
				if (m >>> 0 >= 8388609) break;
				lb(Ja, (c[h >> 2] | 0) >>> 23);
				c[h >> 2] = c[h >> 2] << 8 & 2147483392;
				m = c[s >> 2] << 8;
				c[s >> 2] = m;
				c[n >> 2] = (c[n >> 2] | 0) + 8
			}
			if (v) {
				if (xa) {
					h = Fa + 2 | 0;
					h = (o | 0) < (h | 0) ? o : h;
					l = c[Ja >> 2] | 0;
					p = c[Ja + 8 >> 2] | 0;
					o = Ja + 4 | 0;
					od(l + (h - p) | 0, l + ((c[o >> 2] | 0) - p) | 0, p | 0) | 0;
					c[o >> 2] = h;
					o = h;
					p = h;
					l = 2;
					h = h << 3
				} else h = F;
				E = o << 3;
				X = Ja + 20 | 0;
				Ca = c[X >> 2] | 0;
				c[X >> 2] = Ca + (E - (Ca + ((aa(c[w >> 2] | 0) | 0) + -32)));
				X = l;
				Ca = j;
				ja = h
			} else {
				X = l;
				Ca = 0;
				E = 1;
				ja = F
			}
		} else {
			X = l;
			Ca = 0;
			ja = F
		}
		l = e + 16 | 0;
		t = La + 16 | 0;
		u = La + 20 | 0;
		D = Ia << 2;
		C = x > 65536.0;
		h = 0;
		do {
			n = (c[l >> 2] | 0) == 0 ? 0 : C;
			B = (_(h, I) | 0) + H | 0;
			w = R + (B << 2) | 0;
			y = c[U >> 2] | 0;
			m = e + 148 + (h << 2) | 0;
			j = c[t >> 2] | 0;
			s = c[m >> 2] | 0;
			a: do
				if (!(+g[u >> 2] == 0.0)) {
					v = (Ia | 0) / (y | 0) | 0;
					if ((y | 0) == 1) ta = 53;
					else ta = 52
				} else {
					if ((y | 0) != 1) {
						v = (Ia | 0) / (y | 0) | 0;
						ta = 52;
						break
					}
					if (n) {
						v = (Ia | 0) / (y | 0) | 0;
						ta = 53;
						break
					}
					r = (c[k >> 2] = j, +g[k >> 2]);
					v = 0;
					while (1) {
						if ((v | 0) >= (Ia | 0)) break a;
						q = +g[f + (h + (_(eb, v) | 0) << 2) >> 2] * 32768.0;
						g[R + (B + v << 2) >> 2] = q - (c[k >> 2] = s, +g[k >> 2]);
						s = (g[k >> 2] = r * q, c[k >> 2] | 0);
						v = v + 1 | 0
					}
				}
			while (0);
			if ((ta | 0) == 52) {
				id(w | 0, 0, D | 0) | 0;
				ta = 53
			}
			b: do
				if ((ta | 0) == 53) {
					ta = 0;
					w = 0;
					while (1) {
						if ((w | 0) >= (v | 0)) break;
						g[R + (B + (_(w, y) | 0) << 2) >> 2] = +g[f + (h + (_(eb, w) | 0) << 2) >> 2] * 32768.0;
						w = w + 1 | 0
					}
					c: do
						if (n) {
							n = 0;
							while (1) {
								if ((n | 0) >= (v | 0)) break c;
								w = R + (B + (_(n, y) | 0) << 2) | 0;
								r = +g[w >> 2];
								if (!(r > 65536.0)) {
									if (r < -65536.0) r = -65536.0
								} else r = 65536.0;
								g[w >> 2] = r;
								n = n + 1 | 0
							}
						}
					while (0);
					r = (c[k >> 2] = j, +g[k >> 2]);
					v = 0;
					while (1) {
						if ((v | 0) >= (Ia | 0)) break b;
						fa = R + (B + v << 2) | 0;
						q = +g[fa >> 2];
						g[fa >> 2] = q - (c[k >> 2] = s, +g[k >> 2]);
						s = (g[k >> 2] = r * q, c[k >> 2] | 0);
						v = v + 1 | 0
					}
				}
			while (0);
			c[m >> 2] = s;
			h = h + 1 | 0
		} while ((h | 0) < (eb | 0));
		va = e + 68 | 0;
		if ((((c[va >> 2] | 0) != 0 & (X | 0) > 3 | (X | 0) > (Va * 12 | 0)) & (fb | 0) == 0 & (Ca | 0) == 0 ? (c[e + 20 >> 2] | 0) == 0 : 0) ? (c[e + 24 >> 2] | 0) > 4 : 0) {
			if ((c[e + 116 >> 2] | 0) == 0 | (Ka | 0) == 3) l = 0;
			else l = (c[e + 64 >> 2] | 0) == 5010;
			l = l ^ 1
		} else l = 0;
		W = e + 100 | 0;
		wa = c[W >> 2] | 0;
		l = Za(e, R, G, eb, Ia, wa, Xa, Wa, J, l & 1, X) | 0;
		if (!(+g[Wa >> 2] > .4000000059604645) ? !(+g[e + 108 >> 2] > .4000000059604645) : 0) qa = 0;
		else ta = 74;
		do
			if ((ta | 0) == 74) {
				if ((c[e + 120 >> 2] | 0) != 0 ? !(+g[e + 124 >> 2] > .3) : 0) {
					qa = 0;
					break
				}
				A = +(c[Xa >> 2] | 0);
				q = +(c[e + 104 >> 2] | 0);
				qa = A > q * 1.26 | A < q * .79 ? 1 : 0
			}
		while (0);
		S = (l | 0) == 0;
		d: do
			if (S) {
				if (!((fb | 0) != 0 | (E + 16 | 0) > (ja | 0))) {
					n = c[Ja + 28 >> 2] | 0;
					n = n - (n >>> 1) | 0;
					l = Ja + 32 | 0;
					h = Ja + 28 | 0;
					c[h >> 2] = n;
					m = Ja + 20 | 0;
					while (1) {
						if (n >>> 0 >= 8388609) break d;
						lb(Ja, (c[l >> 2] | 0) >>> 23);
						c[l >> 2] = c[l >> 2] << 8 & 2147483392;
						n = c[h >> 2] << 8;
						c[h >> 2] = n;
						c[m >> 2] = (c[m >> 2] | 0) + 8
					}
				}
			} else {
				h = c[Ja + 28 >> 2] | 0;
				n = h >>> 1;
				l = Ja + 32 | 0;
				c[l >> 2] = (c[Ja + 32 >> 2] | 0) + (h - n);
				h = Ja + 28 | 0;
				c[h >> 2] = n;
				m = Ja + 20 | 0;
				while (1) {
					if (n >>> 0 >= 8388609) break;
					lb(Ja, (c[l >> 2] | 0) >>> 23);
					c[l >> 2] = c[l >> 2] << 8 & 2147483392;
					n = c[h >> 2] << 8;
					c[h >> 2] = n;
					c[m >> 2] = (c[m >> 2] | 0) + 8
				}
				da = (c[Xa >> 2] | 0) + 1 | 0;
				c[Xa >> 2] = da;
				fa = 32 - (aa(da | 0) | 0) | 0;
				ea = fa + -5 | 0;
				gb(Ja, ea, fa + -4 | 0, 6);
				jb(Ja, da - (16 << ea) | 0, fa + -1 | 0);
				c[Xa >> 2] = (c[Xa >> 2] | 0) + -1;
				jb(Ja, c[J >> 2] | 0, 3);
				hb(Ja, wa, 31434, 2)
			}
		while (0);
		H = e + 24 | 0;
		if ((c[H >> 2] | 0) > 0 ? (c[va >> 2] | 0) == 0 : 0) y = _a(R, I, eb, Ba, ca) | 0;
		else y = 0;
		O = (Ka | 0) > 0;
		e: do
			if (O ? ((c[Ja + 20 >> 2] | 0) + ((aa(c[Ja + 28 >> 2] | 0) | 0) + -32) + 3 | 0) <= (ja | 0) : 0)
				if (y) {
					j = (_(eb, Ia) | 0) << 2;
					u = i;
					i = i + ((1 * j | 0) + 15 & -16) | 0;
					j = i;
					i = i + ((1 * (Ta << 2) | 0) + 15 & -16) | 0;
					w = i;
					i = i + ((1 * (Ta << 2) | 0) + 15 & -16) | 0;
					m = (z | 0) == 0;
					if (!m) {
						fa = (c[H >> 2] | 0) > 7;
						l = fa & 1;
						v = _(Va, mb) | 0;
						h = i;
						i = i + ((1 * (v << 2) | 0) + 15 & -16) | 0;
						if (fa) {
							$a(La, 0, R, u, Va, eb, Ka, c[U >> 2] | 0);
							Ma(La, u, j, ma, Va, Ka);
							ub(La, ma, ib, j, h, Va);
							r = +(Ka | 0) * .5;
							n = 0;
							while (1) {
								if ((n | 0) >= (v | 0)) {
									v = j;
									B = y;
									j = z;
									ua = 0;
									break e
								}
								fa = h + (n << 2) | 0;
								g[fa >> 2] = +g[fa >> 2] + r;
								n = n + 1 | 0
							}
						} else {
							v = j;
							B = y;
							j = z;
							ua = 0
						}
					} else {
						v = j;
						n = y;
						j = z;
						s = 0;
						ta = 94
					}
				} else {
					s = 0;
					ta = 92
				}
		else {
			s = 1;
			ta = 92
		}
		while (0);
		if ((ta | 0) == 92) {
			v = (_(eb, Ia) | 0) << 2;
			u = i;
			i = i + ((1 * v | 0) + 15 & -16) | 0;
			v = i;
			i = i + ((1 * (Ta << 2) | 0) + 15 & -16) | 0;
			w = i;
			i = i + ((1 * (Ta << 2) | 0) + 15 & -16) | 0;
			m = 1;
			n = 0;
			j = 0;
			ta = 94
		}
		if ((ta | 0) == 94) {
			B = (_(Va, mb) | 0) << 2;
			h = i;
			i = i + ((1 * B | 0) + 15 & -16) | 0;
			B = n;
			l = 0;
			ua = s
		}
		$a(La, j, R, u, Va, eb, Ka, c[U >> 2] | 0);
		sa = (eb | 0) == 2;
		if (sa & (Va | 0) == 1) c[ca >> 2] = 0;
		Ma(La, u, v, ma, Va, Ka);
		f: do
			if (c[va >> 2] | 0) {
				n = 2;
				while (1) {
					if ((n | 0) >= (ib | 0)) break f;
					fa = v + (n << 2) | 0;
					A = +g[fa >> 2];
					q = +g[v >> 2] * 9.999999747378752e-05;
					q = A < q ? A : q;
					g[fa >> 2] = q;
					g[fa >> 2] = q > 1.0000000036274937e-15 ? q : 1.0000000036274937e-15;
					n = n + 1 | 0
				}
			}
		while (0);
		ub(La, ma, ib, v, w, Va);
		ra = _(Va, mb) | 0;
		T = i;
		i = i + ((1 * (ra << 2) | 0) + 15 & -16) | 0;
		id(T | 0, 0, ib << 2 | 0) | 0;
		Q = (fb | 0) == 0;
		do
			if (Q ? (L = c[e + 192 >> 2] | 0, (L | 0) != 0) : 0) {
				n = c[va >> 2] | 0;
				if (n) {
					y = (n | 0) == 0;
					da = 0;
					V = 0;
					ha = 0;
					break
				}
				F = c[e + 92 >> 2] | 0;
				F = (F | 0) < 2 ? 2 : F;
				D = pa;
				y = 0;
				q = 0.0;
				x = 0.0;
				s = 0;
				while (1) {
					if ((s | 0) >= (Va | 0)) break;
					C = _(mb, s) | 0;
					r = x;
					n = 0;
					while (1) {
						if ((n | 0) >= (F | 0)) break;
						x = +g[L + (C + n << 2) >> 2];
						do
							if (x < .25) {
								if (!(x > -2.0)) {
									x = -2.0;
									break
								}
								if (x > 0.0) ta = 115
							} else {
								x = .25;
								ta = 115
							}
						while (0);
						if ((ta | 0) == 115) {
							ta = 0;
							x = x * .5
						}
						fa = n + 1 | 0;
						ea = (b[D + (fa << 1) >> 1] | 0) - (b[D + (n << 1) >> 1] | 0) | 0;
						y = y + ea | 0;
						q = q + x * +((n << 1 | 1) - F | 0);
						r = r + x * +(ea | 0);
						n = fa
					}
					x = r;
					s = s + 1 | 0
				}
				r = x / +(y | 0) + .20000000298023224;
				q = q * 6.0 / +(_(_(_(Va, F + -1 | 0) | 0, F + 1 | 0) | 0, F) | 0) * .5;
				do
					if (q < .03099999949336052) {
						if (!(q > -.03099999949336052)) {
							q = -.03099999949336052;
							break
						}
					} else q = .03099999949336052;
				while (0);
				y = (b[D + (F << 1) >> 1] | 0) / 2 | 0;
				C = 0;
				while (1) {
					n = C + 1 | 0;
					if ((b[D + (n << 1) >> 1] | 0) < (y | 0)) C = n;
					else break
				}
				s = (Va | 0) == 2;
				y = 0;
				t = 0;
				while (1) {
					if ((t | 0) >= (F | 0)) break;
					n = L + (t << 2) | 0;
					if (s) {
						fa = L + (mb + t << 2) | 0;
						n = c[(+g[n >> 2] > +g[fa >> 2] ? n : fa) >> 2] | 0
					} else n = c[n >> 2] | 0;
					fa = (c[k >> 2] = n, +g[k >> 2]) < 0.0;
					x = (fa ? (c[k >> 2] = n, +g[k >> 2]) : 0.0) - (r + q * +(t - C | 0));
					if (x > .25) {
						g[T + (t << 2) >> 2] = x + -.25;
						y = y + 1 | 0
					}
					t = t + 1 | 0
				}
				g: do
					if ((y | 0) > 2) {
						r = r + .25;
						if (r > 0.0) {
							id(T | 0, 0, F << 2 | 0) | 0;
							q = 0.0;
							r = 0.0;
							break
						} else n = 0;
						while (1) {
							if ((n | 0) >= (F | 0)) break g;
							fa = T + (n << 2) | 0;
							A = +g[fa >> 2] + -.25;
							g[fa >> 2] = A < 0.0 ? 0.0 : A;
							n = n + 1 | 0
						}
					}
				while (0);
				s = (g[k >> 2] = q * 64.0, c[k >> 2] | 0);
				C = (g[k >> 2] = r + .20000000298023224, c[k >> 2] | 0);
				ta = 137
			} else {
				C = 0;
				s = 0;
				ta = 137
			}
		while (0);
		if ((ta | 0) == 137) {
			D = (c[va >> 2] | 0) == 0;
			if (D) {
				q = m ? 0.0 : +(Ka | 0) * .5;
				y = (Va | 0) == 2;
				r = -10.0;
				A = 0.0;
				n = fb;
				while (1) {
					if ((n | 0) >= (ib | 0)) break;
					r = r + -1.0;
					x = +g[w + (n << 2) >> 2] - q;
					x = r > x ? r : x;
					do
						if (y) {
							r = +g[w + (n + mb << 2) >> 2] - q;
							if (x > r) break;
							x = r
						}
					while (0);
					r = x;
					A = A + x;
					n = n + 1 | 0
				}
				y = e + 196 | 0;
				r = +g[y >> 2];
				x = A / +(ib - fb | 0) - r;
				if (!(!(x < -1.5) & x > 3.0)) {
					if (x < -1.5) x = -1.5
				} else x = 3.0;
				ha = (g[k >> 2] = x, c[k >> 2] | 0);
				g[y >> 2] = r + x * .019999999552965164;
				y = D;
				da = C;
				V = s
			} else {
				y = D;
				da = C;
				V = s;
				ha = 0
			}
		}
		if (!l) nd(h | 0, w | 0, ra << 2 | 0) | 0;
		h: do
			if (O) {
				C = Ja + 20 | 0;
				D = Ja + 28 | 0;
				do
					if ((B | 0) == 0 ? ((c[C >> 2] | 0) + ((aa(c[D >> 2] | 0) | 0) + -32) + 3 | 0) <= (ja | 0) : 0) {
						if ((c[H >> 2] | 0) > 4 ^ 1 | y ^ 1) {
							B = 0;
							z = j;
							break
						}
						i: do
							if ((Va | 0) == 1) {
								c[K >> 2] = c[Qa >> 2];
								n = 1;
								while (1) {
									if ((n | 0) >= (ib | 0)) break i;
									A = +g[K + (n + -1 << 2) >> 2] + -1.0;
									q = +g[e + 200 + (db + n << 2) >> 2];
									g[K + (n << 2) >> 2] = A > q ? A : q;
									n = n + 1 | 0
								}
							} else {
								n = e + 200 + (db + mb << 2) | 0;
								c[K >> 2] = c[(+g[Qa >> 2] > +g[n >> 2] ? Qa : n) >> 2];
								n = 1;
								while (1) {
									if ((n | 0) >= (ib | 0)) break i;
									r = +g[K + (n + -1 << 2) >> 2] + -1.0;
									A = +g[e + 200 + (db + n << 2) >> 2];
									q = +g[e + 200 + (db + (n + mb) << 2) >> 2];
									ea = A > q;
									fa = r > (ea ? A : q);
									g[K + (n << 2) >> 2] = fa | ea ? (fa ? r : A) : q;
									n = n + 1 | 0
								}
							}
						while (0);
						n = ib + -2 | 0;
						while (1) {
							if ((n | 0) <= -1) break;
							fa = K + (n << 2) | 0;
							A = +g[fa >> 2];
							q = +g[K + (n + 1 << 2) >> 2] + -1.0;
							g[fa >> 2] = A > q ? A : q;
							n = n + -1 | 0
						}
						m = ib + -1 | 0;
						n = 0;
						x = 0.0;
						y = 2;
						j: while (1) {
							while (1) {
								if ((y | 0) < (m | 0)) break;
								n = n + 1 | 0;
								if ((n | 0) < (Va | 0)) y = 2;
								else break j
							}
							A = +g[w + (y << 2) >> 2];
							q = +g[K + (y << 2) >> 2];
							q = (A < 0.0 ? 0.0 : A) - (q < 0.0 ? 0.0 : q);
							x = x + (q < 0.0 ? 0.0 : q);
							y = y + 1 | 0
						}
						if (!(x / +(_(Va, ib + -3 | 0) | 0) > 1.0)) {
							B = 0;
							z = j;
							break
						}
						$a(La, z, R, u, Va, eb, Ka, c[U >> 2] | 0);
						Ma(La, u, v, ma, Va, Ka);
						ub(La, ma, ib, v, w, Va);
						r = +(Ka | 0) * .5;
						n = 0;
						while (1) {
							if ((n | 0) >= (ra | 0)) break;
							fa = h + (n << 2) | 0;
							g[fa >> 2] = +g[fa >> 2] + r;
							n = n + 1 | 0
						}
						g[Ba >> 2] = .20000000298023224;
						B = 1
					} else z = j;
				while (0);
				n = c[D >> 2] | 0;
				if (((c[C >> 2] | 0) + ((aa(n | 0) | 0) + -32) + 3 | 0) > (ja | 0)) {
					ia = v;
					R = w;
					$ = B;
					ga = z
				} else {
					m = n >>> 3;
					j = n - m | 0;
					n = Ja + 32 | 0;
					if (B) {
						fa = Ja + 32 | 0;
						c[fa >> 2] = (c[n >> 2] | 0) + j;
						n = fa;
						j = m
					}
					m = Ja + 28 | 0;
					c[m >> 2] = j;
					l = Ja + 20 | 0;
					while (1) {
						if (j >>> 0 >= 8388609) {
							ia = v;
							R = w;
							$ = B;
							ga = z;
							break h
						}
						lb(Ja, (c[n >> 2] | 0) >>> 23);
						c[n >> 2] = c[n >> 2] << 8 & 2147483392;
						j = c[m >> 2] << 8;
						c[m >> 2] = j;
						c[l >> 2] = (c[l >> 2] | 0) + 8
					}
				}
			} else {
				ia = v;
				R = w;
				$ = B;
				ga = j
			}
		while (0);
		w = (_(Va, Ia) | 0) << 2;
		fa = i;
		i = i + ((1 * w | 0) + 15 & -16) | 0;
		w = c[la >> 2] << Ka;
		v = c[Da >> 2] | 0;
		l = 0;
		while (1) {
			n = _(l, w) | 0;
			y = 0;
			k: while (1) {
				if ((y | 0) >= (ma | 0)) break;
				x = 1.0 / (+g[ia + (y + (_(l, c[Ua >> 2] | 0) | 0) << 2) >> 2] + 1.0000000272452012e-27);
				j = y + 1 | 0;
				m = v + (j << 1) | 0;
				y = b[v + (y << 1) >> 1] << Ka;
				while (1) {
					if ((y | 0) >= (b[m >> 1] << Ka | 0)) {
						y = j;
						continue k
					}
					ea = y + n | 0;
					g[fa + (ea << 2) >> 2] = +g[u + (ea << 2) >> 2] * x;
					y = y + 1 | 0
				}
			}
			l = l + 1 | 0;
			if ((l | 0) >= (Va | 0)) break
		}
		ba = i;
		i = i + ((1 * (mb << 2) | 0) + 15 & -16) | 0;
		l: do
			if (!((p | 0) < (Va * 15 | 0) | Q ^ 1) ? (c[H >> 2] | 0) > 1 : 0) {
				if (c[va >> 2] | 0) {
					ta = 195;
					break
				}
				do
					if ((p | 0) < 40) v = 24;
					else {
						if ((p | 0) < 60) {
							v = 12;
							break
						}
						v = (p | 0) < 100 ? 8 : 6
					}
				while (0);
				v = ab(La, ma, $, ba, v, fa, Ia, Ka, Z, +g[Ba >> 2], c[ca >> 2] | 0) | 0;
				n = ba + (ma + -1 << 2) | 0;
				j = ma;
				while (1) {
					if ((j | 0) >= (ib | 0)) break l;
					c[ba + (j << 2) >> 2] = c[n >> 2];
					j = j + 1 | 0
				}
			} else ta = 195;
		while (0);
		m: do
			if ((ta | 0) == 195) {
				c[Z >> 2] = 0;
				u = 0;
				while (1) {
					if ((u | 0) >= (ib | 0)) {
						v = 0;
						break m
					}
					c[ba + (u << 2) >> 2] = $;
					u = u + 1 | 0
				}
			}
		while (0);
		ca = i;
		i = i + ((1 * (ra << 2) | 0) + 15 & -16) | 0;
		tb(La, fb, ib, ma, R, Qa, ja, ca, Ja, Va, Ka, X, c[e + 12 >> 2] | 0, e + 84 | 0, (c[H >> 2] | 0) > 3 & 1, c[e + 56 >> 2] | 0, c[va >> 2] | 0);
		U = Ja + 4 | 0;
		y = c[U >> 2] << 3;
		Z = Ja + 20 | 0;
		ea = Ja + 28 | 0;
		C = (c[Z >> 2] | 0) + ((aa(c[ea >> 2] | 0) | 0) + -32) | 0;
		w = ($ | 0) != 0;
		B = w ? 2 : 4;
		if (O) l = (C + B + 1 | 0) >>> 0 <= y >>> 0;
		else l = 0;
		m = y - (l & 1) | 0;
		j = w ? 4 : 5;
		J = Ja + 32 | 0;
		K = Ja + 28 | 0;
		L = Ja + 32 | 0;
		O = Ja + 20 | 0;
		w = 0;
		n = fb;
		z = 0;
		while (1) {
			if ((n | 0) >= (ib | 0)) break;
			D = ba + (n << 2) | 0;
			if ((C + B | 0) >>> 0 > m >>> 0) {
				c[D >> 2] = w;
				B = w
			} else {
				I = c[ea >> 2] | 0;
				y = I >>> B;
				B = I - y | 0;
				if ((c[D >> 2] | 0) == (w | 0)) y = B;
				else c[L >> 2] = (c[J >> 2] | 0) + B;
				c[K >> 2] = y;
				while (1) {
					if (y >>> 0 >= 8388609) break;
					lb(Ja, (c[L >> 2] | 0) >>> 23);
					c[L >> 2] = c[L >> 2] << 8 & 2147483392;
					y = c[K >> 2] << 8;
					c[K >> 2] = y;
					c[O >> 2] = (c[O >> 2] | 0) + 8
				}
				C = (c[Z >> 2] | 0) + ((aa(c[ea >> 2] | 0) | 0) + -32) | 0;
				I = c[D >> 2] | 0;
				B = I;
				z = z | I
			}
			w = B;
			B = j;
			n = n + 1 | 0
		}
		n: do
			if (l) {
				w = $ << 2;
				if ((a[w + z + (31402 + (Ka << 3)) >> 0] | 0) == (a[(w | 2) + z + (31402 + (Ka << 3)) >> 0] | 0)) {
					ta = 218;
					break
				}
				y = c[ea >> 2] | 0;
				n = y >>> 1;
				y = y - n | 0;
				if (v) {
					c[L >> 2] = (c[J >> 2] | 0) + y;
					y = n
				}
				c[K >> 2] = y;
				while (1) {
					if (y >>> 0 >= 8388609) break n;
					lb(Ja, (c[L >> 2] | 0) >>> 23);
					c[L >> 2] = c[L >> 2] << 8 & 2147483392;
					y = c[K >> 2] << 8;
					c[K >> 2] = y;
					c[O >> 2] = (c[O >> 2] | 0) + 8
				}
			} else ta = 218;
		while (0);
		if ((ta | 0) == 218) {
			v = 0;
			w = $ << 2
		}
		w = w + (v << 1) | 0;
		v = fb;
		while (1) {
			if ((v | 0) >= (ib | 0)) break;
			I = ba + (v << 2) | 0;
			c[I >> 2] = a[w + (c[I >> 2] | 0) + (31402 + (Ka << 3)) >> 0];
			v = v + 1 | 0
		}
		if (((c[Z >> 2] | 0) + ((aa(c[ea >> 2] | 0) | 0) + -32) + 4 | 0) <= (ja | 0)) {
			o: do
				if (!(c[va >> 2] | 0)) {
					do
						if (!ga) {
							v = c[H >> 2] | 0;
							if ((v | 0) < 3) break;
							if ((X | 0) < (Va * 10 | 0) | Q ^ 1) {
								ta = 228;
								break
							}
							f = e + 88 | 0;
							I = e + 80 | 0;
							H = c[I >> 2] | 0;
							G = e + 96 | 0;
							u = S ? 0 : 1;
							s = c[la >> 2] << Ka;
							t = c[Da >> 2] | 0;
							do
								if (((b[t + (ma << 1) >> 1] | 0) - (b[t + (ma + -1 << 1) >> 1] | 0) << Ka | 0) < 9) t = 0;
								else {
									y = 0;
									C = 0;
									E = 0;
									B = 0;
									F = 0;
									p: while (1) {
										v = B;
										while (1) {
											if ((v | 0) < (ma | 0)) break;
											y = y + 1 | 0;
											if ((y | 0) < (Va | 0)) v = 0;
											else break p
										}
										D = b[t + (v << 1) >> 1] | 0;
										l = D << 16 >> 16;
										w = (l << Ka) + (_(y, s) | 0) | 0;
										B = v + 1 | 0;
										z = b[t + (B << 1) >> 1] | 0;
										l = (z << 16 >> 16) - l << Ka;
										if ((l | 0) < 9) continue;
										x = +(l | 0);
										D = (z << 16 >> 16) - (D << 16 >> 16) << Ka;
										z = 0;
										n = 0;
										j = 0;
										m = 0;
										while (1) {
											if ((z | 0) == (D | 0)) break;
											q = +g[fa + (w + z << 2) >> 2];
											q = q * q * x;
											z = z + 1 | 0;
											n = q < .25 ? n + 1 | 0 : n;
											j = q < .015625 ? j + 1 | 0 : j;
											m = q < .0625 ? m + 1 | 0 : m
										}
										if ((v | 0) > ((c[Ua >> 2] | 0) + -4 | 0)) C = C + ((m + n << 5 >>> 0) / (l >>> 0) | 0) | 0;
										E = E + 1 | 0;
										F = F + (((j << 1 | 0) >= (l | 0) & 1) + ((m << 1 | 0) >= (l | 0) & 1) + ((n << 1 | 0) >= (l | 0) & 1) << 8) | 0
									}
									do
										if (u) {
											if (!C) w = 0;
											else w = (C >>> 0) / ((_(Va, 4 - (c[Ua >> 2] | 0) + ma | 0) | 0) >>> 0) | 0;
											w = (c[G >> 2] | 0) + w >> 1;
											c[G >> 2] = w;
											switch (c[W >> 2] | 0) {
												case 2:
													{
														w = w + 4 | 0;
														break
													}
												case 0:
													{
														w = w + -4 | 0;
														break
													}
												default:
													{}
											}
											if ((w | 0) > 22) {
												c[W >> 2] = 2;
												break
											}
											if ((w | 0) > 18) {
												c[W >> 2] = 1;
												break
											} else {
												c[W >> 2] = 0;
												break
											}
										}
									while (0);
									v = ((F >>> 0) / (E >>> 0) | 0) + (c[f >> 2] | 0) >> 1;
									c[f >> 2] = v;
									v = (v * 3 | 0) + (3 - H << 7 | 64) + 2 >> 2;
									if ((v | 0) < 80) {
										t = 3;
										break
									}
									if ((v | 0) < 256) {
										t = 2;
										break
									}
									t = (v | 0) < 384 ? 1 : 0
								}
							while (0);
							c[I >> 2] = t;
							break o
						} else ta = 228;
					while (0);
					if ((ta | 0) == 228) v = c[H >> 2] | 0;
					n = e + 80 | 0;
					if (!v) {
						c[n >> 2] = 0;
						t = 0;
						break
					} else {
						c[n >> 2] = 2;
						t = 2;
						break
					}
				} else {
					c[W >> 2] = 0;
					c[e + 80 >> 2] = 2;
					t = 2
				}while (0);hb(Ja, t, 31437, 5)
		}
		Q = i;
		i = i + ((1 * (mb << 2) | 0) + 15 & -16) | 0;
		H = e + 52 | 0;
		s = pa;
		P = +bb(R, h, mb, fb, ib, Va, Q, c[ka >> 2] | 0, c[La + 56 >> 2] | 0, $, c[oa >> 2] | 0, c[H >> 2] | 0, s, Ka, p, Aa, c[va >> 2] | 0, T);
		if (c[va >> 2] | 0) c[Q >> 2] = (p | 0) > 26 ? 8 : (p | 0) / 3 | 0;
		G = i;
		i = i + ((1 * (mb << 2) | 0) + 15 & -16) | 0;
		v = (Ka << 1) + Va + -1 | 0;
		n = La + 104 | 0;
		m = 0;
		while (1) {
			j = c[Ua >> 2] | 0;
			if ((m | 0) >= (j | 0)) break;
			X = m + 1 | 0;
			W = c[Da >> 2] | 0;
			T = (_(j, v) | 0) + m | 0;
			c[G + (m << 2) >> 2] = (_(_((d[(c[n >> 2] | 0) + T >> 0] | 0) + 64 | 0, Va) | 0, (b[W + (X << 1) >> 1] | 0) - (b[W + (m << 1) >> 1] | 0) << Ka) | 0) >> 2;
			m = X
		}
		F = ja << 3;
		f = c[ea >> 2] | 0;
		X = 32 - (aa(f | 0) | 0) | 0;
		f = f >>> (X + -16 | 0);
		D = (f >>> 12) + -8 | 0;
		w = 6;
		v = fb;
		D = (c[Z >> 2] << 3) - ((X << 3) + (D + (f >>> 0 > (c[10984 + (D << 2) >> 2] | 0) >>> 0 & 1))) | 0;
		f = 0;
		while (1) {
			if ((v | 0) >= (ib | 0)) break;
			l = v + 1 | 0;
			B = (_(Va, (b[s + (l << 1) >> 1] | 0) - (b[s + (v << 1) >> 1] | 0) | 0) | 0) << Ka;
			C = B << 3;
			z = (B | 0) < 48;
			B = (C | 0) < ((z ? 48 : B) | 0) ? C : z ? 48 : B;
			z = G + (v << 2) | 0;
			C = Q + (v << 2) | 0;
			h = 0;
			y = w;
			m = 0;
			n = D;
			p = f;
			while (1) {
				if ((n + (y << 3) | 0) >= (F - p | 0)) break;
				if ((h | 0) >= (c[z >> 2] | 0)) break;
				j = (m | 0) < (c[C >> 2] | 0);
				n = c[ea >> 2] | 0;
				v = n >>> y;
				n = n - v | 0;
				if (j) c[L >> 2] = (c[J >> 2] | 0) + n;
				else v = n;
				c[K >> 2] = v;
				while (1) {
					if (v >>> 0 >= 8388609) break;
					lb(Ja, (c[L >> 2] | 0) >>> 23);
					c[L >> 2] = c[L >> 2] << 8 & 2147483392;
					v = c[K >> 2] << 8;
					c[K >> 2] = v;
					c[O >> 2] = (c[O >> 2] | 0) + 8
				}
				X = c[ea >> 2] | 0;
				W = 32 - (aa(X | 0) | 0) | 0;
				X = X >>> (W + -16 | 0);
				n = (X >>> 12) + -8 | 0;
				n = (c[Z >> 2] << 3) - ((W << 3) + (n + (X >>> 0 > (c[10984 + (n << 2) >> 2] | 0) >>> 0 & 1))) | 0;
				if (!j) break;
				h = h + B | 0;
				y = 1;
				m = m + 1 | 0;
				p = p + B | 0
			}
			if (m) w = (w | 0) < 3 ? 2 : w + -1 | 0;
			c[C >> 2] = h;
			v = l;
			D = n;
			f = p
		}
		O = (Va | 0) == 2;
		if (O) {
			if (Ka) {
				v = 0;
				r = 1.0000000036274937e-15;
				q = 1.0000000036274937e-15;
				q: while (1) {
					if ((v | 0) == 13) break;
					X = c[Da >> 2] | 0;
					w = v + 1 | 0;
					n = b[X + (w << 1) >> 1] << Ka;
					v = b[X + (v << 1) >> 1] << Ka;
					while (1) {
						if ((v | 0) >= (n | 0)) {
							v = w;
							continue q
						}
						x = +g[fa + (v << 2) >> 2];
						A = +g[fa + (Ia + v << 2) >> 2];
						v = v + 1 | 0;
						r = r + (+N(+x) + +N(+A));
						q = q + (+N(+(x + A)) + +N(+(x - A)))
					}
				}
				X = b[(c[Da >> 2] | 0) + 26 >> 1] << Ka + 1;
				c[Pa >> 2] = +(X + ((Ka | 0) < 2 ? 5 : 13) | 0) * (q * .7071070075035095) > +(X | 0) * r & 1
			}
			r = +((Ga | 0) / 1e3 | 0 | 0);
			v = e + 188 | 0;
			u = c[v >> 2] | 0;
			s = 0;
			while (1) {
				if ((s | 0) >= 21) break;
				if (r < +g[5668 + (s << 2) >> 2]) break;
				s = s + 1 | 0
			}
			if ((s | 0) > (u | 0) ? r < +g[5668 + (u << 2) >> 2] + +g[5752 + (u << 2) >> 2] : 0) s = u;
			else ta = 292;
			do
				if ((ta | 0) == 292) {
					if ((s | 0) >= (u | 0)) break;
					X = u + -1 | 0;
					if (!(r > +g[5668 + (X << 2) >> 2] - +g[5752 + (X << 2) >> 2])) break;
					s = u
				}
			while (0);
			c[v >> 2] = s;
			X = (fb | 0) > (s | 0);
			c[v >> 2] = (ib | 0) < ((X ? fb : s) | 0) ? ib : X ? fb : s
		}
		if ((D + 48 | 0) > (F - f | 0)) {
			I = 5;
			C = D
		} else {
			do
				if (!(c[va >> 2] | 0)) {
					y = e + 184 | 0;
					A = +g[Ba >> 2];
					h = c[e + 188 >> 2] | 0;
					if (O) {
						v = 0;
						r = 0.0;
						while (1) {
							if ((v | 0) == 8) break;
							j = c[Da >> 2] | 0;
							n = b[j + (v << 1) >> 1] | 0;
							w = n << Ka;
							m = Ia + w | 0;
							v = v + 1 | 0;
							n = (b[j + (v << 1) >> 1] | 0) - n << Ka;
							j = 0;
							q = 0.0;
							while (1) {
								if ((j | 0) >= (n | 0)) break;
								x = q + +g[fa + (w + j << 2) >> 2] * +g[fa + (m + j << 2) >> 2];
								j = j + 1 | 0;
								q = x
							}
							r = r + q
						}
						q = +N(+(r * .125));
						q = q > 1.0 ? 1.0 : q;
						x = q;
						v = 8;
						while (1) {
							if ((v | 0) >= (h | 0)) break;
							n = c[Da >> 2] | 0;
							w = b[n + (v << 1) >> 1] | 0;
							j = w << Ka;
							m = Ia + j | 0;
							v = v + 1 | 0;
							w = (b[n + (v << 1) >> 1] | 0) - w << Ka;
							n = 0;
							r = 0.0;
							while (1) {
								if ((n | 0) >= (w | 0)) break;
								ob = r + +g[fa + (j + n << 2) >> 2] * +g[fa + (m + n << 2) >> 2];
								n = n + 1 | 0;
								r = ob
							}
							r = +N(+r);
							if (x < r) continue;
							x = r
						}
						r = +N(+x);
						r = r > 1.0 ? 1.0 : r;
						q = +Y(+(1.0010000467300415 - q * q)) * 1.4426950408889634;
						ob = q * .5;
						r = +Y(+(1.0010000467300415 - r * r)) * 1.4426950408889634;
						q = q * .75;
						x = +g[y >> 2] + .25;
						r = -((ob > r ? ob : r) * .5);
						g[y >> 2] = x < r ? x : r;
						q = (q < -4.0 ? -4.0 : q) + 5.0
					} else q = 5.0;
					s = ib + -1 | 0;
					u = 0;
					r = 0.0;
					do {
						t = 0;
						while (1) {
							if ((t | 0) >= (s | 0)) break;
							r = r + +g[R + (t + (_(u, c[Ua >> 2] | 0) | 0) << 2) >> 2] * +((t << 1) + 2 - ib | 0);
							t = t + 1 | 0
						}
						u = u + 1 | 0
					} while ((u | 0) < (Va | 0));
					r = (r / +(_(Va, s) | 0) + 1.0) / 6.0;
					do
						if (r > 2.0) r = 2.0;
						else if (r < -2.0) {
						r = -2.0;
						break
					} while (0);
					q = q - r - (c[k >> 2] = V, +g[k >> 2]) - A * 2.0;
					if (c[e + 120 >> 2] | 0) {
						r = (+g[e + 128 >> 2] + .05000000074505806) * 2.0;
						do
							if (r > 2.0) r = 2.0;
							else if (r < -2.0) {
							r = -2.0;
							break
						} while (0);
						q = q - r
					}
					l = ~~+M(+(q + .5));
					if ((l | 0) > 10) {
						l = 10;
						break
					}
					l = (l | 0) < 0 ? 0 : l
				} else l = 5;
			while (0);
			hb(Ja, l, 31441, 7);
			X = c[ea >> 2] | 0;
			W = 32 - (aa(X | 0) | 0) | 0;
			X = X >>> (W + -16 | 0);
			C = (X >>> 12) + -8 | 0;
			I = l;
			C = (c[Z >> 2] << 3) - ((W << 3) + (C + (X >>> 0 > (c[10984 + (C << 2) >> 2] | 0) >>> 0 & 1))) | 0
		}
		if (xa) {
			s = (c[za >> 2] | 0) - Ka | 0;
			E = 1275 >>> (3 - Ka | 0);
			E = (o | 0) < (E | 0) ? o : E;
			l = Ea - ((Va * 320 | 0) + 160) | 0;
			z = (c[H >> 2] | 0) == 0;
			if (z) D = l;
			else D = l + (c[e + 172 >> 2] >> s) | 0;
			w = c[e + 92 >> 2] | 0;
			j = c[e + 188 >> 2] | 0;
			x = +g[e + 184 >> 2];
			m = c[Aa >> 2] | 0;
			A = +g[Ba >> 2];
			n = c[e + 64 >> 2] | 0;
			p = c[va >> 2] | 0;
			B = (c[e + 192 >> 2] | 0) != 0;
			o = c[Ua >> 2] | 0;
			w = (w | 0) == 0 ? o : w;
			h = c[Da >> 2] | 0;
			u = b[h + (w << 1) >> 1] << Ka;
			if (O) y = u + (b[h + (((j | 0) < (w | 0) ? j : w) << 1) >> 1] << Ka) | 0;
			else y = u;
			v = (c[e + 120 >> 2] | 0) == 0;
			do
				if (v) u = D;
				else {
					r = +g[e + 136 >> 2];
					if (!(r < .4)) {
						u = D;
						break
					}
					u = D - ~~(+(y << 3 | 0) * (.4000000059604645 - r)) | 0
				}
			while (0);
			if (O) {
				X = (j | 0) < (w | 0) ? j : w;
				X = (b[h + (X << 1) >> 1] << Ka) - X | 0;
				r = +(X | 0) * .800000011920929 / +(y | 0) * +(u | 0);
				q = ((x < 1.0 ? x : 1.0) + -.10000000149011612) * +(X << 3 | 0);
				u = u - ~~(r < q ? r : q) | 0
			}
			l = u + (m - (16 << Ka)) | 0;
			l = l + ~~((A - ((n | 0) == 5010 ? .019999999552965164 : .03999999910593033)) * +(l | 0)) | 0;
			do
				if ((v ^ 1) & (p | 0) == 0) {
					q = +g[e + 124 >> 2] + -.15000000596046448;
					r = +(y << 3 | 0);
					l = l + ~~(r * 1.2000000476837158 * ((q < 0.0 ? 0.0 : q) + -.09000000357627869)) | 0;
					if (!qa) break;
					l = l + ~~(r * .800000011920929) | 0
				}
			while (0);
			if (B & (p | 0) == 0) {
				da = l + ~~((c[k >> 2] = da, +g[k >> 2]) * +(y << 3 | 0)) | 0;
				l = (l | 0) / 4 | 0;
				l = (l | 0) > (da | 0) ? l : da
			}
			X = ~~(+((_(Va, b[h + (o + -2 << 1) >> 1] << Ka) | 0) << 3 | 0) * P);
			da = l >> 2;
			da = (X | 0) > (da | 0) ? X : da;
			l = (l | 0) < (da | 0) ? l : da;
			do
				if (!(B & (p | 0) == 0)) {
					if (z ^ 1 | (Ga | 0) < 64e3) {
						q = +(Ga + -32e3 | 0) * .000030517578125;
						q = q < 0.0 ? 0.0 : q;
						do
							if (!z)
								if (!(q < .6700000166893005)) {
									q = .6700000166893005;
									break
								}
						while (0);
						l = D + ~~(q * +(l - D | 0)) | 0
					}
					if (!((B ^ 1) & A < .20000000298023224)) break;
					da = 96e3 - Ga | 0;
					l = l + ~~((c[k >> 2] = ha, +g[k >> 2]) * (+(((da | 0) > 32e3 ? 32e3 : (Ga | 0) > 96e3 ? 0 : da) | 0) * 3.099999958067201e-06) * +(l | 0)) | 0
				}
			while (0);
			m = D << 1;
			m = ((m | 0) < (l | 0) ? m : l) + C | 0;
			n = (C + f + 63 >> 6) + 2 - Fa | 0;
			h = m + 32 >> 6;
			h = ((n | 0) > (h | 0) ? n : h) + Fa | 0;
			h = ((E | 0) < (h | 0) ? E : h) - Fa | 0;
			n = (Ca | 0) == 0;
			l = n ? h : 2;
			p = e + 176 | 0;
			o = c[p >> 2] | 0;
			if ((o | 0) < 970) {
				c[p >> 2] = o + 1;
				q = 1.0 / +(o + 21 | 0)
			} else q = 1.0000000474974513e-03;
			do
				if (!z) {
					p = e + 164 | 0;
					c[p >> 2] = (c[p >> 2] | 0) + ((n ? h << 6 : 128) - Ea);
					p = e + 172 | 0;
					da = e + 168 | 0;
					o = c[da >> 2] | 0;
					o = o + ~~(q * +(((n ? m - Ea | 0 : 0) << s) - (c[p >> 2] | 0) - o | 0)) | 0;
					c[da >> 2] = o;
					c[p >> 2] = 0 - o;
					p = e + 164 | 0;
					o = c[p >> 2] | 0;
					if ((o | 0) >= 0) break;
					c[p >> 2] = 0;
					l = l + (n ? (o | 0) / -64 | 0 : 0) | 0
				}
			while (0);
			B = l + Fa | 0;
			B = (E | 0) < (B | 0) ? E : B;
			X = c[Ja >> 2] | 0;
			da = c[Ja + 8 >> 2] | 0;
			od(X + (B - da) | 0, X + ((c[U >> 2] | 0) - da) | 0, da | 0) | 0;
			c[U >> 2] = B
		} else B = o;
		w = i;
		i = i + ((1 * (mb << 2) | 0) + 15 & -16) | 0;
		j = i;
		i = i + ((1 * (mb << 2) | 0) + 15 & -16) | 0;
		y = i;
		i = i + ((1 * (mb << 2) | 0) + 15 & -16) | 0;
		v = B << 6;
		z = c[ea >> 2] | 0;
		da = 32 - (aa(z | 0) | 0) | 0;
		z = z >>> (da + -16 | 0);
		l = (z >>> 12) + -8 | 0;
		l = v + ((da << 3) + (l + (z >>> 0 > (c[10984 + (l << 2) >> 2] | 0) >>> 0 & 1)) - (c[Z >> 2] << 3)) + -1 | 0;
		z = ($ | 0) == 0;
		if ((z ^ 1) & (Ka | 0) > 1) t = (l | 0) >= ((Ka << 3) + 16 | 0);
		else t = 0;
		u = t ? 8 : 0;
		p = l - u | 0;
		if (!(c[e + 120 >> 2] | 0)) l = ib + -1 | 0;
		else {
			do
				if ((Ga | 0) < (Va * 32e3 | 0)) l = 13;
				else {
					if ((Ga | 0) < (Va * 48e3 | 0)) {
						l = 16;
						break
					}
					if ((Ga | 0) < (Va * 6e4 | 0)) {
						l = 18;
						break
					}
					l = (Ga | 0) < (Va * 8e4 | 0) ? 19 : 20
				}
			while (0);
			da = c[e + 144 >> 2] | 0;
			l = (da | 0) > (l | 0) ? da : l
		}
		n = e + 188 | 0;
		o = e + 92 | 0;
		m = wb(La, fb, ib, Q, G, I, n, Pa, p, Na, j, w, y, Va, Ka, Ja, c[o >> 2] | 0, (c[va >> 2] | 0) == 0 ? l : 1) | 0;
		l = c[o >> 2] | 0;
		if (!l) l = m;
		else {
			$ = l + 1 | 0;
			l = l + -1 | 0;
			da = (l | 0) > (m | 0);
			l = ($ | 0) < ((da ? l : m) | 0) ? $ : da ? l : m
		}
		c[o >> 2] = l;
		h = fb;
		while (1) {
			if ((h | 0) >= (ib | 0)) break;
			o = w + (h << 2) | 0;
			da = c[o >> 2] | 0;
			l = 1 << da;
			if ((da | 0) >= 1) {
				q = +((l & 65535) << 16 >> 16);
				l = (l << 16 >> 16) + -1 | 0;
				p = 0;
				do {
					da = ~~+M(+((+g[ca + (h + (_(p, c[Ua >> 2] | 0) | 0) << 2) >> 2] + .5) * q));
					$ = (da | 0) > (l | 0);
					da = (($ ? l : da) | 0) < 0 ? 0 : $ ? l : da;
					jb(Ja, da, c[o >> 2] | 0);
					A = (+(da | 0) + .5) * +(1 << 14 - (c[o >> 2] | 0) | 0) * .00006103515625 + -.5;
					da = e + 200 + (db + (h + (_(p, c[Ua >> 2] | 0) | 0)) << 2) | 0;
					g[da >> 2] = +g[da >> 2] + A;
					da = ca + (h + (_(p, c[Ua >> 2] | 0) | 0) << 2) | 0;
					g[da >> 2] = +g[da >> 2] - A;
					p = p + 1 | 0
				} while ((p | 0) < (Va | 0))
			}
			h = h + 1 | 0
		}
		da = i;
		i = i + ((1 * ra | 0) + 15 & -16) | 0;
		s = e + 76 | 0;
		Oa(La, fb, ib, fa, O ? fa + (Ia << 2) | 0 : 0, da, ia, j, ga, c[e + 80 >> 2] | 0, c[Pa >> 2] | 0, c[n >> 2] | 0, ba, v - u | 0, c[Na >> 2] | 0, Ja, Ka, m, s, c[e + 72 >> 2] | 0);
		if (t) jb(Ja, (c[e + 116 >> 2] | 0) < 2 & 1, 1);
		h = (B << 3) - ((c[Z >> 2] | 0) + ((aa(c[ea >> 2] | 0) | 0) + -32)) | 0;
		p = (Va | 0) > 1 ? 0 - Va | 0 : -1;
		l = 0;
		while (1) {
			if ((l | 0) == 2) break;
			else o = fb;
			while (1) {
				if (!((o | 0) < (ib | 0) & (h | 0) >= (Va | 0))) break;
				m = w + (o << 2) | 0;
				do
					if ((c[m >> 2] | 0) <= 7) {
						if ((c[y + (o << 2) >> 2] | 0) == (l | 0)) n = 0;
						else break;
						do {
							da = !(+g[ca + (o + (_(n, c[Ua >> 2] | 0) | 0) << 2) >> 2] < 0.0) & 1;
							jb(Ja, da, 1);
							fa = e + 200 + (db + (o + (_(n, c[Ua >> 2] | 0) | 0)) << 2) | 0;
							g[fa >> 2] = +g[fa >> 2] + (+(da | 0) + -.5) * +(1 << 14 - (c[m >> 2] | 0) + -1 | 0) * .00006103515625;
							n = n + 1 | 0
						} while ((n | 0) < (Va | 0));
						h = p + h | 0
					}
				while (0);
				o = o + 1 | 0
			}
			l = l + 1 | 0
		}
		r: do
			if (Ca) {
				h = 0;
				while (1) {
					if ((h | 0) >= (ra | 0)) break r;
					g[e + 200 + (db + h << 2) >> 2] = -28.0;
					h = h + 1 | 0
				}
			}
		while (0);
		c[e + 104 >> 2] = c[Xa >> 2];
		c[e + 108 >> 2] = c[Wa >> 2];
		c[e + 112 >> 2] = wa;
		if (sa & (Va | 0) == 1) nd(e + 200 + (db + mb << 2) | 0, Qa | 0, mb << 2 | 0) | 0;
		s: do
			if (z) {
				h = Ta << 2;
				nd(Sa | 0, Ra | 0, h | 0) | 0;
				nd(Ra | 0, Qa | 0, h | 0) | 0;
				h = 0
			} else {
				n = 0;
				while (1) {
					if ((n | 0) >= (Ta | 0)) {
						h = 0;
						break s
					}
					fa = e + 200 + (Ya + n << 2) | 0;
					A = +g[fa >> 2];
					q = +g[e + 200 + (db + n << 2) >> 2];
					g[fa >> 2] = A < q ? A : q;
					n = n + 1 | 0
				}
			}
		while (0);
		do {
			m = _(h, mb) | 0;
			n = 0;
			while (1) {
				if ((n | 0) >= (fb | 0)) {
					n = ib;
					break
				}
				fa = m + n | 0;
				g[e + 200 + (db + fa << 2) >> 2] = 0.0;
				g[e + 200 + (cb + fa << 2) >> 2] = -28.0;
				g[e + 200 + (Ya + fa << 2) >> 2] = -28.0;
				n = n + 1 | 0
			}
			while (1) {
				if ((n | 0) >= (mb | 0)) break;
				fa = m + n | 0;
				g[e + 200 + (db + fa << 2) >> 2] = 0.0;
				g[e + 200 + (cb + fa << 2) >> 2] = -28.0;
				g[e + 200 + (Ya + fa << 2) >> 2] = -28.0;
				n = n + 1 | 0
			}
			h = h + 1 | 0
		} while ((h | 0) < (eb | 0));
		n = e + 116 | 0;
		if (z & (ua | 0) == 0) c[n >> 2] = 0;
		else c[n >> 2] = (c[n >> 2] | 0) + 1;
		c[s >> 2] = c[ea >> 2];
		kb(Ja);
		fa = (c[Ja + 44 >> 2] | 0) == 0 ? B : -3;
		ya(Ha | 0);
		i = nb;
		return fa | 0
	}

	function Ya(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0;
		k = i;
		i = i + 16 | 0;
		j = k;
		c[j >> 2] = d;
		do switch (b | 0) {
			case 4010:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) < 0 | (b | 0) > 10) b = 38;
					else {
						c[a + 24 >> 2] = b;
						b = 37
					}
					break
				}
			case 10010:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) >= 0 ? (b | 0) < (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
						c[a + 32 >> 2] = b;
						b = 37
					} else b = 38;
					break
				}
			case 10012:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) >= 1 ? (b | 0) <= (c[(c[a >> 2] | 0) + 8 >> 2] | 0) : 0) {
						c[a + 36 >> 2] = b;
						b = 37
					} else b = 38;
					break
				}
			case 10002:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) < 0 | (b | 0) > 2) b = 38;
					else {
						c[a + 20 >> 2] = (b | 0) < 2 & 1;
						c[a + 12 >> 2] = (b | 0) == 0 & 1;
						b = 37
					}
					break
				}
			case 4014:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) < 0 | (b | 0) > 100) b = 38;
					else {
						c[a + 56 >> 2] = b;
						b = 37
					}
					break
				}
			case 4020:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[a + 52 >> 2] = b;b = 37;
					break
				}
			case 4006:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[a + 44 >> 2] = b;b = 37;
					break
				}
			case 4002:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) >= 501 | (b | 0) == -1) {
						d = (c[a + 4 >> 2] | 0) * 26e4 | 0;
						c[a + 40 >> 2] = (b | 0) < (d | 0) ? b : d;
						b = 37
					} else b = 38;
					break
				}
			case 10008:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) < 1 | (b | 0) > 2) b = 38;
					else {
						c[a + 8 >> 2] = b;
						b = 37
					}
					break
				}
			case 4036:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if ((b | 0) < 8 | (b | 0) > 24) b = 38;
					else {
						c[a + 60 >> 2] = b;
						b = 37
					}
					break
				}
			case 4037:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[b >> 2] = c[a + 60 >> 2];b = 37;
					break
				}
			case 4040:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[a + 64 >> 2] = b;b = 37;
					break
				}
			case 4028:
				{
					e = a + 4 | 0;h = c[e >> 2] | 0;f = c[a >> 2] | 0;l = c[f + 4 >> 2] | 0;d = _(h, l + 1024 | 0) | 0;j = c[f + 8 >> 2] | 0;b = _(h, j) | 0;d = d + b | 0;b = d + b | 0;id(a + 76 | 0, 0, ((_(l, h) | 0) << 2) + 200 + (h << 12) + ((_(h * 3 | 0, j) | 0) << 2) + -76 | 0) | 0;j = 0;
					while (1) {
						if ((j | 0) >= (_(h, c[f + 8 >> 2] | 0) | 0)) break;
						g[a + 200 + (b + j << 2) >> 2] = -28.0;
						g[a + 200 + (d + j << 2) >> 2] = -28.0;
						f = c[a >> 2] | 0;
						h = c[e >> 2] | 0;
						j = j + 1 | 0
					}
					c[a + 172 >> 2] = 0;g[a + 84 >> 2] = 1.0;c[a + 80 >> 2] = 2;c[a + 88 >> 2] = 256;c[a + 96 >> 2] = 0;c[a + 100 >> 2] = 0;b = 37;
					break
				}
			case 10016:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[a + 48 >> 2] = b;b = 37;
					break
				}
			case 10022:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if (!b) b = 37;
					else {
						d = a + 120 | 0;
						c[d >> 2] = c[b >> 2];
						c[d + 4 >> 2] = c[b + 4 >> 2];
						c[d + 8 >> 2] = c[b + 8 >> 2];
						c[d + 12 >> 2] = c[b + 12 >> 2];
						c[d + 16 >> 2] = c[b + 16 >> 2];
						c[d + 20 >> 2] = c[b + 20 >> 2];
						c[d + 24 >> 2] = c[b + 24 >> 2];
						b = 37
					}
					break
				}
			case 10015:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if (!b) b = 38;
					else {
						c[b >> 2] = c[a >> 2];
						b = 37
					}
					break
				}
			case 4031:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;
					if (!b) b = 38;
					else {
						c[b >> 2] = c[a + 76 >> 2];
						b = 37
					}
					break
				}
			case 10024:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[a + 68 >> 2] = b;b = 37;
					break
				}
			case 10026:
				{
					d = (c[j >> 2] | 0) + (4 - 1) & ~(4 - 1);b = c[d >> 2] | 0;c[j >> 2] = d + 4;c[a + 192 >> 2] = b;b = 37;
					break
				}
			default:
				{
					b = -5;i = k;
					return b | 0
				}
		}
		while (0);
		if ((b | 0) == 37) {
			b = 0;
			i = k;
			return b | 0
		} else if ((b | 0) == 38) {
			b = -1;
			i = k;
			return b | 0
		}
		return 0
	}

	function Za(a, b, d, e, f, h, j, l, m, n, o) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0.0,
			q = 0,
			r = 0,
			s = 0.0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0,
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
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0.0,
			T = 0,
			U = 0;
		R = i;
		i = i + 64 | 0;
		K = R + 32 | 0;
		J = R + 16 | 0;
		Q = R + 8 | 0;
		F = R;
		B = c[a >> 2] | 0;
		L = c[B + 4 >> 2] | 0;
		r = f + 1024 | 0;
		P = (_(r, e) | 0) << 2;
		O = i;
		i = i + ((1 * P | 0) + 15 & -16) | 0;
		c[Q >> 2] = O;
		c[Q + 4 >> 2] = O + (r << 2);
		O = L + f | 0;
		P = f << 2;
		q = 0;
		do {
			I = c[Q + (q << 2) >> 2] | 0;
			nd(I | 0, d + (q << 10 << 2) | 0, 4096) | 0;
			nd(I + 4096 | 0, b + ((_(q, O) | 0) + L << 2) | 0, P | 0) | 0;
			q = q + 1 | 0
		} while ((q | 0) < (e | 0));
		if (!n) {
			c[F >> 2] = 15;
			t = a + 104 | 0;
			q = 15;
			n = 0
		} else {
			I = r >> 1;
			E = na() | 0;
			H = i;
			i = i + ((1 * (I << 2) | 0) + 15 & -16) | 0;
			G = a + 72 | 0;
			q = c[G >> 2] | 0;
			n = 1;
			while (1) {
				if ((n | 0) >= (I | 0)) break;
				A = n << 1;
				r = c[Q >> 2] | 0;
				g[H + (n << 2) >> 2] = ((+g[r + (A + -1 << 2) >> 2] + +g[r + ((A | 1) << 2) >> 2]) * .5 + +g[r + (A << 2) >> 2]) * .5;
				n = n + 1 | 0
			}
			A = c[Q >> 2] | 0;
			g[H >> 2] = (+g[A + 4 >> 2] * .5 + +g[A >> 2]) * .5;
			if ((e | 0) == 2) {
				n = Q + 4 | 0;
				r = 1;
				while (1) {
					if ((r | 0) >= (I | 0)) break;
					C = r << 1;
					t = c[n >> 2] | 0;
					A = H + (r << 2) | 0;
					g[A >> 2] = +g[A >> 2] + ((+g[t + (C + -1 << 2) >> 2] + +g[t + ((C | 1) << 2) >> 2]) * .5 + +g[t + (C << 2) >> 2]) * .5;
					r = r + 1 | 0
				}
				A = c[n >> 2] | 0;
				g[H >> 2] = +g[H >> 2] + (+g[A + 4 >> 2] * .5 + +g[A >> 2]) * .5
			}
			sb(H, K, I, q);
			g[K >> 2] = +g[K >> 2] * 1.000100016593933;
			n = 1;
			while (1) {
				if ((n | 0) == 5) break;
				q = K + (n << 2) | 0;
				s = +g[q >> 2];
				p = +(n | 0) * .00800000037997961;
				g[q >> 2] = s - s * p * p;
				n = n + 1 | 0
			}
			n = c[K >> 2] | 0;
			r = 0;
			while (1) {
				if ((r | 0) == 4) break;
				g[J + (r << 2) >> 2] = 0.0;
				r = r + 1 | 0
			}
			a: do
				if (+g[K >> 2] != 0.0) {
					u = 0;
					while (1) {
						if ((u | 0) < 4) {
							s = 0.0;
							r = 0
						} else {
							n = 0;
							s = 1.0;
							break a
						}
						while (1) {
							if ((u | 0) == (r | 0)) break;
							s = s + +g[J + (r << 2) >> 2] * +g[K + (u - r << 2) >> 2];
							r = r + 1 | 0
						}
						z = u + 1 | 0;
						v = (c[k >> 2] = n, +g[k >> 2]);
						s = (s + +g[K + (z << 2) >> 2]) / v;
						p = -s;
						g[J + (u << 2) >> 2] = p;
						r = z >> 1;
						t = u + -1 | 0;
						n = 0;
						while (1) {
							if ((n | 0) >= (r | 0)) break;
							A = J + (n << 2) | 0;
							x = +g[A >> 2];
							q = J + (t - n << 2) | 0;
							y = +g[q >> 2];
							g[A >> 2] = x + y * p;
							g[q >> 2] = y + x * p;
							n = n + 1 | 0
						}
						s = v - s * s * v;
						if (s < +g[K >> 2] * 1.0000000474974513e-03) {
							n = 0;
							s = 1.0;
							break a
						}
						n = (g[k >> 2] = s, c[k >> 2] | 0);
						u = z
					}
				} else {
					n = 0;
					s = 1.0
				}
			while (0);
			while (1) {
				if ((n | 0) == 4) break;
				p = s * .8999999761581421;
				K = J + (n << 2) | 0;
				g[K >> 2] = +g[K >> 2] * p;
				n = n + 1 | 0;
				s = p
			}
			x = +g[J >> 2];
			p = x + .800000011920929;
			y = +g[J + 4 >> 2];
			x = y + x * .800000011920929;
			v = +g[J + 8 >> 2];
			y = v + y * .800000011920929;
			s = +g[J + 12 >> 2];
			v = s + v * .800000011920929;
			s = s * .800000011920929;
			u = 0;
			t = 0;
			n = 0;
			r = 0;
			q = 0;
			w = 0;
			while (1) {
				if ((w | 0) >= (I | 0)) break;
				K = H + (w << 2) | 0;
				J = c[K >> 2] | 0;
				S = (c[k >> 2] = J, +g[k >> 2]);
				S = S + p * (c[k >> 2] = u, +g[k >> 2]);
				S = S + x * (c[k >> 2] = t, +g[k >> 2]);
				S = S + y * (c[k >> 2] = n, +g[k >> 2]);
				S = S + v * (c[k >> 2] = r, +g[k >> 2]);
				g[K >> 2] = S + s * (c[k >> 2] = q, +g[k >> 2]);
				K = u;
				u = J;
				w = w + 1 | 0;
				q = r;
				r = n;
				n = t;
				t = K
			}
			pb(H + 2048 | 0, H, f, F, c[G >> 2] | 0);
			c[F >> 2] = 1024 - (c[F >> 2] | 0);
			t = a + 104 | 0;
			p = +qb(H, f, F, c[t >> 2] | 0, +g[a + 108 >> 2], c[G >> 2] | 0);
			q = c[F >> 2] | 0;
			if ((q | 0) > 1022) {
				c[F >> 2] = 1022;
				q = 1022
			}
			p = p * .699999988079071;
			r = c[a + 56 >> 2] | 0;
			if ((r | 0) > 2) {
				p = p * .5;
				if ((r | 0) > 4) n = (r | 0) > 8 ? 0 : (g[k >> 2] = p * .5, c[k >> 2] | 0);
				else D = 36
			} else D = 36;
			if ((D | 0) == 36) n = (g[k >> 2] = p, c[k >> 2] | 0);
			ya(E | 0)
		}
		A = c[t >> 2] | 0;
		K = q - A | 0;
		p = (((K | 0) > -1 ? K : 0 - K | 0) * 10 | 0) > (q | 0) ? .4000000059604645 : .20000000298023224;
		if ((o | 0) >= 25) {
			if ((o | 0) < 35) D = 43
		} else {
			p = p + .10000000149011612;
			D = 43
		}
		if ((D | 0) == 43) p = p + .10000000149011612;
		K = a + 108 | 0;
		s = +g[K >> 2];
		r = (g[k >> 2] = s, c[k >> 2] | 0);
		v = s > .4000000059604645 ? p + -.10000000149011612 : p;
		v = s > .550000011920929 ? v + -.10000000149011612 : v;
		p = (c[k >> 2] = n, +g[k >> 2]);
		if (p < (v > .20000000298023224 ? v : .20000000298023224)) {
			H = 0;
			I = 0;
			J = 0
		} else {
			H = +N(+(p - s)) < .10000000149011612;
			H = ~~+M(+((c[k >> 2] = H ? r : n, +g[k >> 2]) * 32.0 / 3.0 + .5));
			J = H + -1 | 0;
			J = (J | 0) > 7 ? 7 : (H | 0) < 1 ? 0 : J;
			H = (g[k >> 2] = +(J + 1 | 0) * .09375, c[k >> 2] | 0);
			I = 1
		}
		E = B + 44 | 0;
		F = L << 2;
		y = -(c[k >> 2] = H, +g[k >> 2]);
		G = a + 112 | 0;
		B = B + 60 | 0;
		C = a + 72 | 0;
		D = (f | 0) > 1024;
		o = 1024 - f << 2;
		r = A;
		n = 0;
		while (1) {
			A = c[E >> 2] | 0;
			z = A - L | 0;
			c[t >> 2] = (r | 0) > 15 ? r : 15;
			u = _(n, O) | 0;
			r = a + 200 + ((_(n, L) | 0) << 2) | 0;
			nd(b + (u << 2) | 0, r | 0, F | 0) | 0;
			if ((A | 0) == (L | 0)) {
				w = u + L | 0;
				A = c[Q + (n << 2) >> 2] | 0
			} else {
				w = u + L | 0;
				A = c[Q + (n << 2) >> 2] | 0;
				U = c[t >> 2] | 0;
				p = - +g[K >> 2];
				T = c[G >> 2] | 0;
				Wa(b + (w << 2) | 0, A + 4096 | 0, U, U, z, p, p, T, T, 0, 0, c[C >> 2] | 0)
			}
			Wa(b + (w + z << 2) | 0, A + (z + 1024 << 2) | 0, c[t >> 2] | 0, q, f - z | 0, - +g[K >> 2], y, c[G >> 2] | 0, h, c[B >> 2] | 0, L, c[C >> 2] | 0);
			nd(r | 0, b + (u + f << 2) | 0, F | 0) | 0;
			r = n << 10;
			u = d + (r << 2) | 0;
			if (D) od(u | 0, A + (f << 2) | 0, 4096) | 0;
			else {
				od(u | 0, d + (r + f << 2) | 0, o | 0) | 0;
				od(d + (r + 1024 - f << 2) | 0, A + 4096 | 0, P | 0) | 0
			}
			n = n + 1 | 0;
			if ((n | 0) >= (e | 0)) break;
			r = c[t >> 2] | 0
		}
		c[l >> 2] = H;
		c[j >> 2] = q;
		c[m >> 2] = J;
		i = R;
		return I | 0
	}

	function _a(a, b, e, f, h) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var j = 0.0,
			l = 0,
			m = 0,
			n = 0,
			o = 0.0,
			p = 0.0,
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
			A = 0;
		z = i;
		q = i;
		i = i + ((1 * (b << 2) | 0) + 15 & -16) | 0;
		r = (b | 0) / 2 | 0;
		s = +(r | 0);
		t = +(r | 0);
		u = r + -5 | 0;
		v = (r * 6 | 0) + -102 | 0;
		w = 0;
		x = 0;
		while (1) {
			if ((x | 0) >= (e | 0)) break;
			m = _(x, b) | 0;
			l = 0;
			j = 0.0;
			n = 0;
			while (1) {
				if ((n | 0) >= (b | 0)) break;
				p = +g[a + (n + m << 2) >> 2];
				o = (c[k >> 2] = l, +g[k >> 2]) + p;
				A = (g[k >> 2] = j + o - p * 2.0, c[k >> 2] | 0);
				g[q + (n << 2) >> 2] = o;
				l = A;
				j = p - o * .5;
				n = n + 1 | 0
			}
			l = q;
			m = l + 48 | 0;
			do {
				c[l >> 2] = 0;
				l = l + 4 | 0
			} while ((l | 0) < (m | 0));
			p = 0.0;
			m = 0;
			l = 0;
			while (1) {
				if ((l | 0) >= (r | 0)) {
					o = 0.0;
					n = 0;
					m = r;
					break
				}
				n = l << 1;
				j = +g[q + (n << 2) >> 2];
				o = +g[q + ((n | 1) << 2) >> 2];
				o = j * j + o * o;
				j = (c[k >> 2] = m, +g[k >> 2]);
				j = j + (o - j) * .0625;
				g[q + (l << 2) >> 2] = j;
				p = p + o;
				m = (g[k >> 2] = j, c[k >> 2] | 0);
				l = l + 1 | 0
			}
			while (1) {
				l = m + -1 | 0;
				if ((m | 0) <= 0) break;
				j = (c[k >> 2] = n, +g[k >> 2]);
				n = q + (l << 2) | 0;
				j = j + (+g[n >> 2] - j) * .125;
				g[n >> 2] = j;
				n = (g[k >> 2] = j, c[k >> 2] | 0);
				if (o > j) {
					m = l;
					continue
				}
				o = j;
				m = l
			}
			j = t / (+O(+(p * o * .5 * s)) + 1.0000000036274937e-15) * 64.0;
			m = 12;
			l = 0;
			while (1) {
				if ((m | 0) >= (u | 0)) break;
				n = ~~+M(+(j * +g[q + (m << 2) >> 2]));
				m = m + 4 | 0;
				l = l + (d[31452 + ((n | 0) > 127 ? 127 : (n | 0) < 0 ? 0 : n) >> 0] | 0) | 0
			}
			l = (l << 8 | 0) / (v | 0) | 0;
			if ((l | 0) > (w | 0)) c[h >> 2] = x;
			else l = w;
			w = l;
			x = x + 1 | 0
		}
		l = (w | 0) > 200 & 1;
		j = +O(+(+(w * 27 | 0))) + -42.0;
		if (!(j < 0.0)) {
			if (!(j > 163.0)) y = 20
		} else {
			j = 0.0;
			y = 20
		}
		if ((y | 0) == 20)
			if (j * .006899999920278788 + -.139 < 0.0) {
				j = 0.0;
				j = +O(+j);
				g[f >> 2] = j;
				i = z;
				return l | 0
			}
		if (j > 163.0) {
			j = .9856999502182007;
			j = +O(+j);
			g[f >> 2] = j;
			i = z;
			return l | 0
		}
		j = j * .006899999920278788 + -.139;
		j = +O(+j);
		g[f >> 2] = j;
		i = z;
		return l | 0
	}

	function $a(a, b, d, e, f, h, i, j) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0.0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		q = c[a + 4 >> 2] | 0;
		o = (b | 0) == 0;
		t = c[a + 44 >> 2] | 0;
		p = c[a + 36 >> 2] | 0;
		s = o ? 1 : b;
		t = o ? t << i : t;
		p = o ? p - i | 0 : p;
		o = a + 64 | 0;
		r = _(s, t) | 0;
		n = r + q | 0;
		a = a + 60 | 0;
		k = 0;
		do {
			i = _(k, n) | 0;
			l = _(_(k, t) | 0, s) | 0;
			b = 0;
			while (1) {
				if ((b | 0) >= (s | 0)) break;
				u = d + (i + (_(b, t) | 0) << 2) | 0;
				nb(o, u, e + (b + l << 2) | 0, c[a >> 2] | 0, q, p, s);
				b = b + 1 | 0
			}
			k = k + 1 | 0
		} while ((k | 0) < (h | 0));
		a: do
			if ((h | 0) == 2 & (f | 0) == 1) {
				b = 0;
				while (1) {
					if ((b | 0) >= (r | 0)) break a;
					h = e + (b << 2) | 0;
					g[h >> 2] = +g[h >> 2] * .5 + +g[e + (r + b << 2) >> 2] * .5;
					b = b + 1 | 0
				}
			}
		while (0);
		if ((j | 0) == 1) return;
		a = (r | 0) / (j | 0) | 0;
		m = +(j | 0);
		b = r - a << 2;
		l = 0;
		do {
			k = _(_(l, s) | 0, t) | 0;
			i = 0;
			while (1) {
				if ((i | 0) >= (a | 0)) break;
				h = e + (k + i << 2) | 0;
				g[h >> 2] = +g[h >> 2] * m;
				i = i + 1 | 0
			}
			id(e + (k + a << 2) | 0, 0, b | 0) | 0;
			l = l + 1 | 0
		} while ((l | 0) < (f | 0));
		return
	}

	function ab(d, e, f, h, j, l, m, n, o, p, q) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		p = +p;
		q = q | 0;
		var r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0,
			F = 0.0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			M = 0,
			O = 0;
		O = i;
		i = i + 16 | 0;
		H = O;
		F = .5 - p;
		F = (F < -.25 ? -.25 : F) * .03999999910593033;
		K = i;
		i = i + ((1 * (e << 2) | 0) + 15 & -16) | 0;
		E = d + 32 | 0;
		L = c[E >> 2] | 0;
		J = e + -1 | 0;
		L = (b[L + (e << 1) >> 1] | 0) - (b[L + (J << 1) >> 1] | 0) << n;
		C = i;
		i = i + ((1 * (L << 2) | 0) + 15 & -16) | 0;
		D = i;
		i = i + ((1 * (L << 2) | 0) + 15 & -16) | 0;
		L = i;
		i = i + ((1 * (e << 2) | 0) + 15 & -16) | 0;
		M = i;
		i = i + ((1 * (e << 2) | 0) + 15 & -16) | 0;
		c[o >> 2] = 0;
		w = _(q, m) | 0;
		G = (f | 0) == 0;
		x = _(n, -2) | 0;
		y = 1 << n;
		z = +(n + 1 | 0) * F;
		r = 0;
		while (1) {
			if ((r | 0) >= (e | 0)) break;
			A = r + 1 | 0;
			B = c[E >> 2] | 0;
			u = b[B + (r << 1) >> 1] | 0;
			B = (b[B + (A << 1) >> 1] | 0) - u | 0;
			s = B << n;
			B = (B | 0) == 1;
			d = s << 2;
			nd(C | 0, l + (w + (u << n) << 2) | 0, d | 0) | 0;
			u = G ? 0 : n;
			p = 0.0;
			m = 0;
			while (1) {
				if ((m | 0) >= (s | 0)) break;
				p = p + +N(+(+g[C + (m << 2) >> 2]));
				m = m + 1 | 0
			}
			v = p + +(u | 0) * F * p;
			m = (g[k >> 2] = v, c[k >> 2] | 0);
			if (!G)
				if (!B) {
					nd(D | 0, C | 0, d | 0) | 0;
					Na(D, s >> n, y);
					p = 0.0;
					u = 0;
					while (1) {
						if ((u | 0) >= (s | 0)) break;
						p = p + +N(+(+g[D + (u << 2) >> 2]));
						u = u + 1 | 0
					}
					p = p + z * p;
					if (p < v) {
						u = f;
						d = (g[k >> 2] = p, c[k >> 2] | 0);
						q = -1;
						t = 0
					} else {
						u = f;
						d = m;
						q = 0;
						t = 0
					}
				} else {
					u = f;
					d = m;
					q = 0;
					t = 0
				}
			else {
				u = 0;
				d = m;
				q = 0;
				t = 0
			}
			while (1) {
				if ((t | 0) >= ((((u | 0) == 0 ? B : 1) & 1 ^ 1) + n | 0)) break;
				m = G ? t + 1 | 0 : n - t + -1 | 0;
				Na(C, s >> t, 1 << t);
				v = 0.0;
				u = 0;
				while (1) {
					if ((u | 0) >= (s | 0)) break;
					v = v + +N(+(+g[C + (u << 2) >> 2]));
					u = u + 1 | 0
				}
				p = v + +(m | 0) * F * v;
				if (p < (c[k >> 2] = d, +g[k >> 2])) {
					m = t + 1 | 0;
					u = f;
					d = (g[k >> 2] = p, c[k >> 2] | 0);
					q = m;
					t = m;
					continue
				} else {
					u = f;
					t = t + 1 | 0;
					continue
				}
			}
			if (G) {
				m = _(q, -2) | 0;
				u = K + (r << 2) | 0;
				c[u >> 2] = m;
				d = 0
			} else {
				m = q << 1;
				u = K + (r << 2) | 0;
				c[u >> 2] = m;
				d = n
			}
			c[o >> 2] = (c[o >> 2] | 0) + (d - ((m | 0) / 2 | 0));
			if (!B) {
				r = A;
				continue
			}
			if (!((m | 0) == 0 | (m | 0) == (x | 0))) {
				r = A;
				continue
			}
			c[u >> 2] = m + -1;
			r = A
		}
		u = f << 2;
		r = 0;
		while (1) {
			if ((r | 0) == 2) break;
			q = u + (r << 1) | 0;
			d = 31402 + (n << 3) + q | 0;
			q = (q | 1) + (31402 + (n << 3)) | 0;
			t = 0;
			s = G ? j : 0;
			m = 1;
			while (1) {
				if ((m | 0) >= (e | 0)) break;
				E = s + j | 0;
				f = t + j | 0;
				o = c[K + (m << 2) >> 2] | 0;
				l = o - (a[d >> 0] << 1) | 0;
				o = o - (a[q >> 0] << 1) | 0;
				t = ((t | 0) < (E | 0) ? t : E) + ((l | 0) > -1 ? l : 0 - l | 0) | 0;
				s = ((f | 0) < (s | 0) ? f : s) + ((o | 0) > -1 ? o : 0 - o | 0) | 0;
				m = m + 1 | 0
			}
			c[H + (r << 2) >> 2] = (t | 0) < (s | 0) ? t : s;
			r = r + 1 | 0
		}
		if ((c[H + 4 >> 2] | 0) < (c[H >> 2] | 0))
			if (G) {
				s = 0;
				I = 35
			} else {
				r = 0;
				m = 1
			}
		else {
			s = 0;
			if (G) I = 35;
			else {
				r = 0;
				m = s
			}
		}
		if ((I | 0) == 35) {
			r = j;
			m = s
		}
		t = u + (m << 1) | 0;
		d = 31402 + (n << 3) + t | 0;
		t = (t | 1) + (31402 + (n << 3)) | 0;
		q = 0;
		s = r;
		r = 1;
		while (1) {
			if ((r | 0) >= (e | 0)) break;
			l = s + j | 0;
			E = (q | 0) < (l | 0);
			c[L + (r << 2) >> 2] = E ? 0 : 1;
			G = q + j | 0;
			o = (G | 0) < (s | 0);
			c[M + (r << 2) >> 2] = o ? 0 : 1;
			n = c[K + (r << 2) >> 2] | 0;
			f = n - (a[d >> 0] << 1) | 0;
			n = n - (a[t >> 0] << 1) | 0;
			q = (E ? q : l) + ((f | 0) > -1 ? f : 0 - f | 0) | 0;
			s = (o ? G : s) + ((n | 0) > -1 ? n : 0 - n | 0) | 0;
			r = r + 1 | 0
		}
		s = (q | 0) >= (s | 0) & 1;
		c[h + (J << 2) >> 2] = s;
		r = e + -2 | 0;
		while (1) {
			if ((r | 0) <= -1) break;
			n = c[((s | 0) == 1 ? M : L) + (r + 1 << 2) >> 2] | 0;
			c[h + (r << 2) >> 2] = n;
			s = n;
			r = r + -1 | 0
		}
		i = O;
		return m | 0
	}

	function bb(a, d, e, f, h, j, l, m, n, o, p, q, r, s, t, u, v, w) {
		a = a | 0;
		d = d | 0;
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
		var x = 0,
			y = 0.0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0.0,
			E = 0,
			F = 0,
			G = 0,
			H = 0.0,
			I = 0,
			J = 0,
			K = 0,
			L = 0.0,
			M = 0.0,
			N = 0,
			O = 0;
		K = i;
		F = _(j, e) | 0;
		I = i;
		i = i + ((1 * (F << 2) | 0) + 15 & -16) | 0;
		G = i;
		i = i + ((1 * (F << 2) | 0) + 15 & -16) | 0;
		id(l | 0, 0, e << 2 | 0) | 0;
		y = +(9 - m | 0);
		m = 0;
		while (1) {
			if ((m | 0) >= (h | 0)) {
				m = 0;
				y = -31.899999618530273;
				break
			}
			F = m + 5 | 0;
			g[G + (m << 2) >> 2] = +(b[n + (m << 1) >> 1] | 0) * .0625 + .5 + y - +g[22920 + (m << 2) >> 2] + +(_(F, F) | 0) * .006200000178068876;
			m = m + 1 | 0
		}
		while (1) {
			B = _(m, e) | 0;
			H = y;
			n = 0;
			while (1) {
				if ((n | 0) >= (h | 0)) break;
				y = +g[a + (B + n << 2) >> 2] - +g[G + (n << 2) >> 2];
				H = H > y ? H : y;
				n = n + 1 | 0
			}
			m = m + 1 | 0;
			if ((m | 0) >= (j | 0)) break;
			else y = H
		}
		if (!((t | 0) > 50 & (s | 0) > 0 & (v | 0) == 0)) {
			j = 0;
			c[u >> 2] = j;
			i = K;
			return +H
		}
		z = h + -2 | 0;
		x = h + -1 | 0;
		F = 0;
		v = 0;
		while (1) {
			E = _(F, e) | 0;
			m = I + (E << 2) | 0;
			n = c[d + (E << 2) >> 2] | 0;
			c[m >> 2] = n;
			D = (c[k >> 2] = n, +g[k >> 2]);
			y = D;
			A = v;
			v = 1;
			while (1) {
				if ((v | 0) >= (h | 0)) {
					C = A;
					break
				}
				B = E + v | 0;
				L = +g[d + (B << 2) >> 2];
				B = L > +g[d + (B + -1 << 2) >> 2] + .5 ? v : A;
				M = y + 1.5;
				L = M < L ? M : L;
				g[I + (E + v << 2) >> 2] = L;
				y = L;
				A = B;
				v = v + 1 | 0
			}
			while (1) {
				v = C + -1 | 0;
				if ((C | 0) <= 0) {
					v = 2;
					break
				}
				B = I + (E + v << 2) | 0;
				M = +g[B >> 2];
				L = +g[I + (E + C << 2) >> 2] + 2.0;
				y = +g[d + (E + v << 2) >> 2];
				O = L < y;
				N = M < (O ? L : y);
				g[B >> 2] = N | O ? (N ? M : L) : y;
				C = v
			}
			while (1) {
				if ((v | 0) >= (z | 0)) break;
				B = I + (E + v << 2) | 0;
				L = +g[B >> 2];
				y = +cb(d + (E + v + -2 << 2) | 0) + -1.0;
				g[B >> 2] = L > y ? L : y;
				v = v + 1 | 0
			}
			y = +g[d + (E + 1 << 2) >> 2];
			v = D > y;
			C = (g[k >> 2] = y, c[k >> 2] | 0);
			B = v ? n : C;
			C = v ? C : n;
			v = c[d + (E + 2 << 2) >> 2] | 0;
			D = (c[k >> 2] = B, +g[k >> 2]);
			y = (c[k >> 2] = v, +g[k >> 2]);
			if (!(D < y)) {
				if ((c[k >> 2] = C, +g[k >> 2]) < y) C = v
			} else C = B;
			y = (c[k >> 2] = C, +g[k >> 2]) + -1.0;
			D = +g[m >> 2];
			g[m >> 2] = D > y ? D : y;
			v = I + (E + 1 << 2) | 0;
			D = +g[v >> 2];
			g[v >> 2] = D > y ? D : y;
			v = E + h | 0;
			y = +g[d + (v + -3 << 2) >> 2];
			D = +g[d + (v + -2 << 2) >> 2];
			n = y > D;
			B = (g[k >> 2] = y, c[k >> 2] | 0);
			m = (g[k >> 2] = D, c[k >> 2] | 0);
			C = n ? B : m;
			B = n ? m : B;
			v = c[d + (v + -1 << 2) >> 2] | 0;
			D = (c[k >> 2] = C, +g[k >> 2]);
			y = (c[k >> 2] = v, +g[k >> 2]);
			if (!(D < y)) {
				if ((c[k >> 2] = B, +g[k >> 2]) < y) B = v
			} else B = C;
			y = (c[k >> 2] = B, +g[k >> 2]) + -1.0;
			C = I + (E + z << 2) | 0;
			D = +g[C >> 2];
			g[C >> 2] = D > y ? D : y;
			C = I + (E + x << 2) | 0;
			D = +g[C >> 2];
			g[C >> 2] = D > y ? D : y;
			C = 0;
			while (1) {
				if ((C | 0) >= (h | 0)) break;
				m = I + (E + C << 2) | 0;
				D = +g[m >> 2];
				y = +g[G + (C << 2) >> 2];
				g[m >> 2] = D > y ? D : y;
				C = C + 1 | 0
			}
			F = F + 1 | 0;
			if ((F | 0) >= (j | 0)) break;
			else v = A
		}
		a: do
			if ((j | 0) == 2) {
				z = f;
				while (1) {
					if ((z | 0) >= (h | 0)) {
						x = f;
						break a
					}
					F = z + e | 0;
					G = I + (F << 2) | 0;
					y = +g[G >> 2];
					d = I + (z << 2) | 0;
					D = +g[d >> 2] + -4.0;
					D = y > D ? y : D;
					g[G >> 2] = D;
					y = +g[d >> 2];
					D = D + -4.0;
					D = y > D ? y : D;
					g[d >> 2] = D;
					D = +g[a + (z << 2) >> 2] - D;
					y = +g[a + (F << 2) >> 2] - +g[G >> 2];
					g[d >> 2] = ((D < 0.0 ? 0.0 : D) + (y < 0.0 ? 0.0 : y)) * .5;
					z = z + 1 | 0
				}
			} else {
				x = f;
				while (1) {
					if ((x | 0) >= (h | 0)) {
						x = f;
						break a
					}
					e = I + (x << 2) | 0;
					y = +g[a + (x << 2) >> 2] - +g[e >> 2];
					g[e >> 2] = y < 0.0 ? 0.0 : y;
					x = x + 1 | 0
				}
			}
		while (0);
		while (1) {
			if ((x | 0) >= (h | 0)) break;
			a = I + (x << 2) | 0;
			D = +g[a >> 2];
			y = +g[w + (x << 2) >> 2];
			g[a >> 2] = D > y ? D : y;
			x = x + 1 | 0
		}
		v = (p | 0) == 0;
		b: do
			if (((v ^ 1) & (q | 0) == 0 ^ 1) & (o | 0) == 0) {
				x = f;
				while (1) {
					if ((x | 0) >= (h | 0)) break b;
					p = I + (x << 2) | 0;
					g[p >> 2] = +g[p >> 2] * .5;
					x = x + 1 | 0
				}
			}
		while (0);
		C = (t | 0) / 4 | 0;
		B = (q | 0) == 0;
		n = (o | 0) == 0;
		x = 0;
		while (1) {
			if ((f | 0) >= (h | 0)) {
				J = 53;
				break
			}
			if ((f | 0) >= 8)
				if ((f | 0) > 11) {
					z = I + (f << 2) | 0;
					y = +g[z >> 2] * .5;
					g[z >> 2] = y
				} else J = 42;
			else {
				J = I + (f << 2) | 0;
				g[J >> 2] = +g[J >> 2] * 2.0;
				J = 42
			}
			if ((J | 0) == 42) {
				J = 0;
				o = I + (f << 2) | 0;
				z = o;
				y = +g[o >> 2]
			}
			y = y < 4.0 ? y : 4.0;
			g[z >> 2] = y;
			m = f + 1 | 0;
			z = (_((b[r + (m << 1) >> 1] | 0) - (b[r + (f << 1) >> 1] | 0) | 0, j) | 0) << s;
			do
				if ((z | 0) >= 6)
					if ((z | 0) > 48) {
						o = ~~(y * 8.0);
						A = o;
						z = ((_(o, z) | 0) << 3 | 0) / 8 | 0;
						break
					} else {
						z = ~~(y * +(z | 0) / 6.0);
						A = z;
						z = z * 48 | 0;
						break
					}
			else {
				o = ~~y;
				A = o;
				z = (_(o, z) | 0) << 3
			} while (0);
			if (!((v ^ 1) & (B | n ^ 1)) ? (x + z >> 6 | 0) > (C | 0) : 0) break;
			c[l + (f << 2) >> 2] = A;
			f = m;
			x = x + z | 0
		}
		if ((J | 0) == 53) {
			c[u >> 2] = x;
			i = K;
			return +H
		}
		j = C << 6;
		c[l + (f << 2) >> 2] = j - x;
		c[u >> 2] = j;
		i = K;
		return +H
	}

	function cb(a) {
		a = a | 0;
		var b = 0,
			d = 0.0,
			e = 0.0,
			f = 0.0,
			h = 0,
			j = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0;
		r = i;
		i = i + 16 | 0;
		b = r + 12 | 0;
		o = r + 8 | 0;
		p = r + 4 | 0;
		q = r;
		n = c[a + 8 >> 2] | 0;
		c[o >> 2] = n;
		e = +g[a >> 2];
		f = +g[a + 4 >> 2];
		h = (g[k >> 2] = e, c[k >> 2] | 0);
		j = (g[k >> 2] = f, c[k >> 2] | 0);
		if (e > f) {
			g[b >> 2] = e;
			m = h
		} else {
			g[b >> 2] = f;
			m = j;
			j = h
		}
		e = +g[a + 12 >> 2];
		f = +g[a + 16 >> 2];
		h = (g[k >> 2] = e, c[k >> 2] | 0);
		l = (g[k >> 2] = f, c[k >> 2] | 0);
		if (e > f) {
			g[p >> 2] = f;
			g[q >> 2] = e;
			a = l
		} else {
			g[p >> 2] = e;
			g[q >> 2] = f;
			a = h;
			h = l
		}
		d = (c[k >> 2] = j, +g[k >> 2]);
		if (d > (c[k >> 2] = a, +g[k >> 2])) {
			c[p >> 2] = j;
			c[b >> 2] = h;
			c[q >> 2] = m;
			l = h;
			h = m
		} else {
			l = m;
			j = a
		}
		f = (c[k >> 2] = n, +g[k >> 2]);
		e = (c[k >> 2] = l, +g[k >> 2]);
		d = (c[k >> 2] = j, +g[k >> 2]);
		do
			if (f > e)
				if (e < d) {
					if (f < d) {
						b = o;
						break
					}
					b = p;
					break
				} else {
					if ((c[k >> 2] = h, +g[k >> 2]) < e) {
						b = q;
						break
					}
					break
				}
		else
		if (f < d) {
			if (e < d) break;
			b = p;
			break
		} else {
			if (f < (c[k >> 2] = h, +g[k >> 2])) {
				b = o;
				break
			}
			b = q;
			break
		}
		while (0);
		i = r;
		return +(+g[b >> 2])
	}

	function db(a, b) {
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
			m = 0;
		e = b + -1 | 0;
		d = 32 - (aa(e | 0) | 0) | 0;
		if ((d | 0) <= 8) {
			e = a + 28 | 0;
			h = c[e >> 2] | 0;
			f = (h >>> 0) / (b >>> 0) | 0;
			c[a + 36 >> 2] = f;
			j = a + 32 | 0;
			k = c[j >> 2] | 0;
			i = ((k >>> 0) / (f >>> 0) | 0) + 1 | 0;
			i = i >>> 0 > b >>> 0 ? b : i;
			d = b - i | 0;
			g = _(f, b - (d + 1) | 0) | 0;
			c[j >> 2] = k - g;
			c[e >> 2] = (i | 0) == (b | 0) ? h - g | 0 : f;
			fb(a);
			return d | 0
		}
		d = d + -8 | 0;
		k = (e >>> d) + 1 | 0;
		f = a + 28 | 0;
		i = c[f >> 2] | 0;
		g = (i >>> 0) / (k >>> 0) | 0;
		c[a + 36 >> 2] = g;
		l = a + 32 | 0;
		m = c[l >> 2] | 0;
		j = ((m >>> 0) / (g >>> 0) | 0) + 1 | 0;
		j = k >>> 0 < j >>> 0 ? k : j;
		b = k - j | 0;
		h = _(g, k - (b + 1) | 0) | 0;
		c[l >> 2] = m - h;
		c[f >> 2] = (k | 0) == (j | 0) ? i - h | 0 : g;
		fb(a);
		d = b << d | (eb(a, d) | 0);
		if (d >>> 0 <= e >>> 0) {
			k = d;
			return k | 0
		}
		c[a + 44 >> 2] = 1;
		k = e;
		return k | 0
	}

	function eb(a, b) {
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

	function fb(a) {
		a = a | 0;
		var b = 0,
			e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0;
		g = a + 28 | 0;
		h = a + 20 | 0;
		i = a + 40 | 0;
		j = a + 24 | 0;
		k = a + 4 | 0;
		l = a + 32 | 0;
		b = c[g >> 2] | 0;
		while (1) {
			if (b >>> 0 >= 8388609) break;
			c[h >> 2] = (c[h >> 2] | 0) + 8;
			b = b << 8;
			c[g >> 2] = b;
			f = c[i >> 2] | 0;
			e = c[j >> 2] | 0;
			if (e >>> 0 < (c[k >> 2] | 0) >>> 0) {
				c[j >> 2] = e + 1;
				e = d[(c[a >> 2] | 0) + e >> 0] | 0
			} else e = 0;
			c[i >> 2] = e;
			c[l >> 2] = ((f << 8 | e) >>> 1 & 255 | c[l >> 2] << 8 & 2147483392) ^ 255
		}
		return
	}

	function gb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0;
		f = ((c[a + 28 >> 2] | 0) >>> 0) / (e >>> 0) | 0;
		if (!b) {
			b = _(f, e - d | 0) | 0;
			e = a + 28 | 0;
			c[e >> 2] = (c[e >> 2] | 0) - b;
			b = a + 32 | 0
		} else {
			h = a + 28 | 0;
			e = (c[h >> 2] | 0) - (_(f, e - b | 0) | 0) | 0;
			g = a + 32 | 0;
			c[g >> 2] = (c[g >> 2] | 0) + e;
			c[h >> 2] = _(f, d - b | 0) | 0;
			e = h;
			b = g
		}
		f = a + 20 | 0;
		d = c[e >> 2] | 0;
		while (1) {
			if (d >>> 0 >= 8388609) break;
			lb(a, (c[b >> 2] | 0) >>> 23);
			c[b >> 2] = c[b >> 2] << 8 & 2147483392;
			d = c[e >> 2] << 8;
			c[e >> 2] = d;
			c[f >> 2] = (c[f >> 2] | 0) + 8
		}
		return
	}

	function hb(a, b, e, f) {
		a = a | 0;
		b = b | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0,
			i = 0,
			j = 0;
		f = (c[a + 28 >> 2] | 0) >>> f;
		if ((b | 0) > 0) {
			h = a + 28 | 0;
			i = e + (b + -1) | 0;
			j = (c[h >> 2] | 0) - (_(f, d[i >> 0] | 0) | 0) | 0;
			g = a + 32 | 0;
			c[g >> 2] = (c[g >> 2] | 0) + j;
			c[h >> 2] = _(f, (d[i >> 0] | 0) - (d[e + b >> 0] | 0) | 0) | 0;
			f = h
		} else {
			g = _(f, d[e + b >> 0] | 0) | 0;
			f = a + 28 | 0;
			c[f >> 2] = (c[f >> 2] | 0) - g;
			g = a + 32 | 0
		}
		b = a + 20 | 0;
		e = c[f >> 2] | 0;
		while (1) {
			if (e >>> 0 >= 8388609) break;
			lb(a, (c[g >> 2] | 0) >>> 23);
			c[g >> 2] = c[g >> 2] << 8 & 2147483392;
			e = c[f >> 2] << 8;
			c[f >> 2] = e;
			c[b >> 2] = (c[b >> 2] | 0) + 8
		}
		return
	}

	function ib(a, b, c) {
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
			gb(a, c, c + 1 | 0, (d >>> e) + 1 | 0);
			jb(a, (1 << e) + -1 & b, e);
			return
		} else {
			gb(a, b, b + 1 | 0, c);
			return
		}
	}

	function jb(b, d, e) {
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

	function kb(b) {
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
		n = c[b + 28 >> 2] | 0;
		h = aa(n | 0) | 0;
		e = 2147483647 >>> h;
		f = c[b + 32 >> 2] | 0;
		g = f + e & ~e;
		if ((g | e) >>> 0 >= (f + n | 0) >>> 0) {
			g = e >>> 1;
			g = f + g & ~g;
			h = h + 1 | 0
		}
		p = h + 7 & -8;
		f = h;
		while (1) {
			if ((f | 0) <= 0) break;
			lb(b, g >>> 23);
			g = g << 8 & 2147483392;
			f = f + -8 | 0
		}
		if (!((c[b + 40 >> 2] | 0) <= -1 ? (c[b + 36 >> 2] | 0) == 0 : 0)) lb(b, 0);
		f = c[b + 16 >> 2] | 0;
		n = b + 24 | 0;
		l = b + 8 | 0;
		m = b + 4 | 0;
		o = b + 44 | 0;
		j = f + ((f | 0) < 7 ? ~f : -8) + 8 & -8;
		k = f;
		e = c[b + 12 >> 2] | 0;
		while (1) {
			if ((k | 0) <= 7) break;
			i = c[l >> 2] | 0;
			g = c[m >> 2] | 0;
			if (((c[n >> 2] | 0) + i | 0) >>> 0 < g >>> 0) {
				i = i + 1 | 0;
				c[l >> 2] = i;
				a[(c[b >> 2] | 0) + (g - i) >> 0] = e;
				i = 0
			} else i = -1;
			c[o >> 2] = c[o >> 2] | i;
			k = k + -8 | 0;
			e = e >>> 8
		}
		f = f - j | 0;
		if (c[o >> 2] | 0) return;
		k = c[n >> 2] | 0;
		id((c[b >> 2] | 0) + k | 0, 0, (c[m >> 2] | 0) - k - (c[l >> 2] | 0) | 0) | 0;
		if ((f | 0) <= 0) return;
		i = c[l >> 2] | 0;
		g = c[m >> 2] | 0;
		if (g >>> 0 <= i >>> 0) {
			c[o >> 2] = -1;
			return
		}
		h = p - h | 0;
		if ((h | 0) < (f | 0) ? ((c[n >> 2] | 0) + i | 0) >>> 0 >= g >>> 0 : 0) {
			c[o >> 2] = -1;
			e = e & (1 << h) + -1
		}
		n = (c[b >> 2] | 0) + (g - i + -1) | 0;
		a[n >> 0] = d[n >> 0] | 0 | e;
		return
	}

	function lb(b, d) {
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
		if ((d | 0) == 255) {
			d = b + 36 | 0;
			c[d >> 2] = (c[d >> 2] | 0) + 1;
			return
		}
		h = d >> 8;
		m = b + 40 | 0;
		e = c[m >> 2] | 0;
		if ((e | 0) > -1) {
			f = b + 24 | 0;
			g = c[f >> 2] | 0;
			if ((g + (c[b + 8 >> 2] | 0) | 0) >>> 0 < (c[b + 4 >> 2] | 0) >>> 0) {
				c[f >> 2] = g + 1;
				a[(c[b >> 2] | 0) + g >> 0] = e + h;
				e = 0
			} else e = -1;
			l = b + 44 | 0;
			c[l >> 2] = c[l >> 2] | e
		}
		i = b + 36 | 0;
		g = c[i >> 2] | 0;
		if (g) {
			j = b + 24 | 0;
			k = b + 8 | 0;
			l = b + 4 | 0;
			h = h + 255 & 255;
			e = b + 44 | 0;
			do {
				f = c[j >> 2] | 0;
				if ((f + (c[k >> 2] | 0) | 0) >>> 0 < (c[l >> 2] | 0) >>> 0) {
					c[j >> 2] = f + 1;
					a[(c[b >> 2] | 0) + f >> 0] = h;
					g = c[i >> 2] | 0;
					f = 0
				} else f = -1;
				c[e >> 2] = c[e >> 2] | f;
				g = g + -1 | 0;
				c[i >> 2] = g
			} while ((g | 0) != 0)
		}
		c[m >> 2] = d & 255;
		return
	}

	function mb(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0.0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0.0,
			u = 0.0,
			v = 0.0,
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
			L = 0,
			M = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0.0,
			V = 0.0,
			W = 0.0,
			X = 0.0,
			Y = 0.0,
			Z = 0.0,
			$ = 0.0,
			aa = 0.0;
		E = i;
		i = i + 32 | 0;
		D = E;
		B = d;
		if ((c[a + 8 >> 2] | 0) > 0) C = c[a + 8 >> 2] | 0;
		else C = 0;
		c[D >> 2] = 1;
		e = 1;
		f = 0;
		do {
			z = f << 1;
			A = b[a + 12 + ((z | 1) << 1) >> 1] | 0;
			e = _(e, b[a + 12 + (z << 1) >> 1] | 0) | 0;
			f = f + 1 | 0;
			c[D + (f << 2) >> 2] = e
		} while (A << 16 >> 16 != 1);
		A = a + 48 | 0;
		x = b[a + 12 + ((f << 1) + -1 << 1) >> 1] | 0;
		a: while (1) {
			z = f + -1 | 0;
			if ((f | 0) <= 0) break;
			f = z << 1;
			if (!z) y = 1;
			else y = b[a + 12 + (f + -1 << 1) >> 1] | 0;
			switch (b[a + 12 + (f << 1) >> 1] | 0) {
				case 2:
					{
						e = c[D + (z << 2) >> 2] | 0;f = B;h = 0;
						while (1) {
							if ((h | 0) >= (e | 0)) {
								x = y;
								f = z;
								continue a
							}
							x = f;
							s = x + 32 | 0;
							t = +g[s >> 2];
							u = +g[x + 36 >> 2];
							v = +g[x >> 2];
							g[s >> 2] = v - t;
							s = x + 4 | 0;
							m = +g[s >> 2];
							g[x + 36 >> 2] = m - u;
							g[x >> 2] = v + t;
							g[s >> 2] = m + u;
							s = x + 40 | 0;
							u = +g[s >> 2];
							w = x + 44 | 0;
							m = +g[w >> 2];
							t = (u + m) * .7071067690849304;
							u = (m - u) * .7071067690849304;
							r = x + 8 | 0;
							m = +g[r >> 2];
							g[s >> 2] = m - t;
							s = x + 12 | 0;
							v = +g[s >> 2];
							g[w >> 2] = v - u;
							g[r >> 2] = m + t;
							g[s >> 2] = v + u;
							s = x + 52 | 0;
							u = +g[s >> 2];
							r = x + 48 | 0;
							v = +g[r >> 2];
							w = x + 16 | 0;
							t = +g[w >> 2];
							g[r >> 2] = t - u;
							r = x + 20 | 0;
							m = +g[r >> 2];
							g[s >> 2] = m + v;
							g[w >> 2] = t + u;
							g[r >> 2] = m - v;
							r = x + 60 | 0;
							v = +g[r >> 2];
							w = x + 56 | 0;
							m = +g[w >> 2];
							u = (v - m) * .7071067690849304;
							m = (-v - m) * .7071067690849304;
							s = x + 24 | 0;
							v = +g[s >> 2];
							g[w >> 2] = v - u;
							w = x + 28 | 0;
							t = +g[w >> 2];
							g[r >> 2] = t - m;
							g[s >> 2] = v + u;
							g[w >> 2] = t + m;
							f = x + 64 | 0;
							h = h + 1 | 0
						}
					}
				case 4:
					{
						s = c[D + (z << 2) >> 2] | 0;n = s << C;
						if ((x | 0) == 1) {
							f = B;
							h = 0;
							while (1) {
								if ((h | 0) >= (s | 0)) {
									x = y;
									f = z;
									continue a
								}
								x = f;
								m = +g[x >> 2];
								n = x + 16 | 0;
								K = +g[n >> 2];
								v = m - K;
								k = x + 4 | 0;
								G = +g[k >> 2];
								l = x + 20 | 0;
								I = +g[l >> 2];
								t = G - I;
								K = m + K;
								I = G + I;
								j = x + 8 | 0;
								G = +g[j >> 2];
								r = x + 24 | 0;
								m = +g[r >> 2];
								J = G + m;
								e = x + 12 | 0;
								F = +g[e >> 2];
								w = x + 28 | 0;
								u = +g[w >> 2];
								H = F + u;
								g[n >> 2] = K - J;
								g[l >> 2] = I - H;
								g[x >> 2] = K + J;
								g[k >> 2] = I + H;
								m = G - m;
								u = F - u;
								g[j >> 2] = v + u;
								g[e >> 2] = t - m;
								g[r >> 2] = v - u;
								g[w >> 2] = t + m;
								f = x + 32 | 0;
								h = h + 1 | 0
							}
						}
						f = x << 1;e = x * 3 | 0;j = n << 1;k = n * 3 | 0;p = 0;
						while (1) {
							if ((p | 0) >= (s | 0)) {
								x = y;
								f = z;
								continue a
							}
							h = d + ((_(p, y) | 0) << 3) | 0;
							r = c[A >> 2] | 0;
							o = 0;
							l = r;
							q = r;
							while (1) {
								if ((o | 0) >= (x | 0)) break;
								Q = h + (x << 3) | 0;
								F = +g[Q >> 2];
								M = l;
								J = +g[M >> 2];
								P = h + (x << 3) + 4 | 0;
								v = +g[P >> 2];
								H = +g[M + 4 >> 2];
								K = F * J - v * H;
								J = F * H + v * J;
								T = h + (f << 3) | 0;
								v = +g[T >> 2];
								L = q;
								H = +g[L >> 2];
								S = h + (f << 3) + 4 | 0;
								F = +g[S >> 2];
								t = +g[L + 4 >> 2];
								I = v * H - F * t;
								H = v * t + F * H;
								O = h + (e << 3) | 0;
								F = +g[O >> 2];
								w = r;
								t = +g[w >> 2];
								N = h + (e << 3) + 4 | 0;
								v = +g[N >> 2];
								u = +g[w + 4 >> 2];
								m = F * t - v * u;
								t = F * u + v * t;
								v = +g[h >> 2];
								u = v - I;
								R = h + 4 | 0;
								F = +g[R >> 2];
								G = F - H;
								I = v + I;
								g[h >> 2] = I;
								H = F + H;
								g[R >> 2] = H;
								F = K + m;
								v = J + t;
								m = K - m;
								t = J - t;
								g[T >> 2] = I - F;
								g[S >> 2] = H - v;
								g[h >> 2] = +g[h >> 2] + F;
								g[R >> 2] = +g[R >> 2] + v;
								g[Q >> 2] = u + t;
								g[P >> 2] = G - m;
								g[O >> 2] = u - t;
								g[N >> 2] = G + m;
								h = h + 8 | 0;
								o = o + 1 | 0;
								l = M + (n << 3) | 0;
								q = L + (j << 3) | 0;
								r = w + (k << 3) | 0
							}
							p = p + 1 | 0
						}
					}
				case 3:
					{
						k = c[D + (z << 2) >> 2] | 0;j = k << C;l = x << 1;n = _(j, x) | 0;m = +g[(c[A >> 2] | 0) + (n << 3) + 4 >> 2];n = j << 1;p = 0;
						while (1) {
							if ((p | 0) >= (k | 0)) {
								x = y;
								f = z;
								continue a
							}
							e = d + ((_(p, y) | 0) << 3) | 0;
							f = c[A >> 2] | 0;
							o = x;
							h = f;
							while (1) {
								s = e + (x << 3) | 0;
								v = +g[s >> 2];
								F = +g[h >> 2];
								w = e + (x << 3) + 4 | 0;
								I = +g[w >> 2];
								t = +g[h + 4 >> 2];
								H = v * F - I * t;
								F = v * t + I * F;
								q = e + (l << 3) | 0;
								I = +g[q >> 2];
								t = +g[f >> 2];
								r = e + (l << 3) + 4 | 0;
								v = +g[r >> 2];
								u = +g[f + 4 >> 2];
								G = I * t - v * u;
								t = I * u + v * t;
								v = H + G;
								u = F + t;
								g[s >> 2] = +g[e >> 2] - v * .5;
								L = e + 4 | 0;
								g[w >> 2] = +g[L >> 2] - u * .5;
								G = (H - G) * m;
								t = (F - t) * m;
								g[e >> 2] = +g[e >> 2] + v;
								g[L >> 2] = +g[L >> 2] + u;
								g[q >> 2] = +g[s >> 2] + t;
								g[r >> 2] = +g[w >> 2] - G;
								g[s >> 2] = +g[s >> 2] - t;
								g[w >> 2] = +g[w >> 2] + G;
								o = o + -1 | 0;
								if (!o) break;
								else {
									e = e + 8 | 0;
									h = h + (j << 3) | 0;
									f = f + (n << 3) | 0
								}
							}
							p = p + 1 | 0
						}
					}
				case 5:
					{
						s = c[D + (z << 2) >> 2] | 0;r = s << C;f = _(r, x) | 0;e = c[A >> 2] | 0;m = +g[e + (f << 3) >> 2];t = +g[e + (f << 3) + 4 >> 2];f = _(r << 1, x) | 0;u = +g[e + (f << 3) >> 2];v = +g[e + (f << 3) + 4 >> 2];f = x << 1;h = x * 3 | 0;j = x << 2;q = 0;
						while (1) {
							if ((q | 0) >= (s | 0)) {
								x = y;
								f = z;
								continue a
							}
							p = _(q, y) | 0;
							k = d + (p << 3) | 0;
							l = d + (p + x << 3) | 0;
							n = d + (p + f << 3) | 0;
							o = d + (p + h << 3) | 0;
							p = d + (p + j << 3) | 0;
							w = 0;
							while (1) {
								if ((w | 0) >= (x | 0)) break;
								X = +g[k >> 2];
								V = +g[k + 4 >> 2];
								W = +g[l >> 2];
								P = _(w, r) | 0;
								I = +g[e + (P << 3) >> 2];
								O = l + 4 | 0;
								$ = +g[O >> 2];
								aa = +g[e + (P << 3) + 4 >> 2];
								F = W * I - $ * aa;
								I = W * aa + $ * I;
								$ = +g[n >> 2];
								P = _(w << 1, r) | 0;
								aa = +g[e + (P << 3) >> 2];
								M = n + 4 | 0;
								W = +g[M >> 2];
								K = +g[e + (P << 3) + 4 >> 2];
								Z = $ * aa - W * K;
								aa = $ * K + W * aa;
								W = +g[o >> 2];
								P = _(w * 3 | 0, r) | 0;
								K = +g[e + (P << 3) >> 2];
								L = o + 4 | 0;
								$ = +g[L >> 2];
								H = +g[e + (P << 3) + 4 >> 2];
								G = W * K - $ * H;
								K = W * H + $ * K;
								$ = +g[p >> 2];
								P = _(w << 2, r) | 0;
								H = +g[e + (P << 3) >> 2];
								N = p + 4 | 0;
								W = +g[N >> 2];
								U = +g[e + (P << 3) + 4 >> 2];
								J = $ * H - W * U;
								H = $ * U + W * H;
								W = F + J;
								U = I + H;
								J = F - J;
								H = I - H;
								I = Z + G;
								F = aa + K;
								G = Z - G;
								K = aa - K;
								g[k >> 2] = +g[k >> 2] + (W + I);
								P = k + 4 | 0;
								g[P >> 2] = +g[P >> 2] + (U + F);
								aa = X + W * m + I * u;
								Z = V + U * m + F * u;
								$ = H * t + K * v;
								Y = -(J * t) - G * v;
								g[l >> 2] = aa - $;
								g[O >> 2] = Z - Y;
								g[p >> 2] = aa + $;
								g[N >> 2] = Z + Y;
								I = X + W * u + I * m;
								F = V + U * u + F * m;
								H = K * t - H * v;
								G = J * v - G * t;
								g[n >> 2] = I + H;
								g[M >> 2] = F + G;
								g[o >> 2] = I - H;
								g[L >> 2] = F - G;
								k = k + 8 | 0;
								l = l + 8 | 0;
								n = n + 8 | 0;
								o = o + 8 | 0;
								p = p + 8 | 0;
								w = w + 1 | 0
							}
							q = q + 1 | 0
						}
					}
				default:
					{
						x = y;f = z;
						continue a
					}
			}
		}
		i = E;
		return
	}

	function nb(a, d, e, f, h, j, k) {
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
			B = 0.0,
			C = 0,
			D = 0,
			E = 0,
			F = 0.0,
			G = 0.0,
			H = 0.0,
			I = 0.0;
		E = i;
		A = c[a + 8 + (j << 2) >> 2] | 0;
		B = +g[A + 4 >> 2];
		o = c[a >> 2] | 0;
		n = 0;
		p = c[a + 24 >> 2] | 0;
		while (1) {
			z = o >> 1;
			if ((n | 0) >= (j | 0)) break;
			o = z;
			n = n + 1 | 0;
			p = p + (z << 2) | 0
		}
		D = o >> 2;
		m = i;
		i = i + ((1 * (z << 2) | 0) + 15 & -16) | 0;
		a = i;
		i = i + ((1 * (D << 3) | 0) + 15 & -16) | 0;
		s = h >> 1;
		C = z + -1 | 0;
		u = h + 3 >> 2;
		y = 0 - z | 0;
		n = (u | 0) > 0 ? u : 0;
		x = n << 1;
		w = s + x | 0;
		v = z + s + -1 - x | 0;
		r = d + (v << 2) | 0;
		q = 0;
		o = f + (s << 2) | 0;
		j = f + (s + -1 << 2) | 0;
		l = d + (s << 2) | 0;
		s = d + (C + s << 2) | 0;
		t = m;
		while (1) {
			if ((q | 0) >= (u | 0)) break;
			g[t >> 2] = +g[j >> 2] * +g[l + (z << 2) >> 2] + +g[o >> 2] * +g[s >> 2];
			g[t + 4 >> 2] = +g[o >> 2] * +g[l >> 2] - +g[j >> 2] * +g[s + (y << 2) >> 2];
			q = q + 1 | 0;
			o = o + 8 | 0;
			j = j + -8 | 0;
			l = l + 8 | 0;
			s = s + -8 | 0;
			t = t + 8 | 0
		}
		t = h + -1 | 0;
		u = D - u | 0;
		q = (n | 0) > (u | 0) ? n : u;
		j = q << 1;
		l = n << 1;
		h = j - l | 0;
		j = d + (v + (l - j) << 2) | 0;
		l = d + (w << 2) | 0;
		o = m + (x << 2) | 0;
		while (1) {
			if ((n | 0) >= (u | 0)) break;
			c[o >> 2] = c[r >> 2];
			c[o + 4 >> 2] = c[l >> 2];
			n = n + 1 | 0;
			l = l + 8 | 0;
			r = r + -8 | 0;
			o = o + 8 | 0
		}
		r = f;
		l = f + (t << 2) | 0;
		n = d + (w + h << 2) | 0;
		o = m + (x + h << 2) | 0;
		while (1) {
			if ((q | 0) >= (D | 0)) break;
			g[o >> 2] = +g[l >> 2] * +g[j >> 2] - +g[r >> 2] * +g[n + (y << 2) >> 2];
			g[o + 4 >> 2] = +g[l >> 2] * +g[n >> 2] + +g[r >> 2] * +g[j + (z << 2) >> 2];
			q = q + 1 | 0;
			r = r + 8 | 0;
			l = l + -8 | 0;
			n = n + 8 | 0;
			j = j + -8 | 0;
			o = o + 8 | 0
		}
		o = A + 44 | 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (D | 0)) break;
			H = +g[p + (j << 2) >> 2];
			F = +g[p + (D + j << 2) >> 2];
			G = +g[m >> 2];
			I = +g[m + 4 >> 2];
			z = b[(c[o >> 2] | 0) + (j << 1) >> 1] | 0;
			g[a + (z << 3) >> 2] = B * (G * H - I * F);
			g[a + (z << 3) + 4 >> 2] = B * (I * H + G * F);
			j = j + 1 | 0;
			m = m + 8 | 0
		}
		mb(A, a);
		j = k << 1;
		o = 0 - j | 0;
		m = 0;
		n = e;
		l = e + ((_(C, k) | 0) << 2) | 0;
		while (1) {
			if ((m | 0) >= (D | 0)) break;
			F = +g[a + 4 >> 2];
			G = +g[p + (D + m << 2) >> 2];
			H = +g[a >> 2];
			B = +g[p + (m << 2) >> 2];
			g[n >> 2] = F * G - H * B;
			g[l >> 2] = H * G + F * B;
			a = a + 8 | 0;
			m = m + 1 | 0;
			n = n + (j << 2) | 0;
			l = l + (o << 2) | 0
		}
		i = E;
		return
	}

	function ob(a, b, d, e, f, h) {
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

	function pb(a, b, d, e, f) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var h = 0.0,
			j = 0,
			k = 0.0,
			l = 0.0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0;
		t = i;
		i = i + 1968 | 0;
		q = t;
		o = q;
		c[o >> 2] = 0;
		c[o + 4 >> 2] = 0;
		o = d >> 2;
		n = i;
		i = i + ((1 * (o << 2) | 0) + 15 & -16) | 0;
		m = d + 979 >> 2;
		j = i;
		i = i + ((1 * (m << 2) | 0) + 15 & -16) | 0;
		s = t + 8 | 0;
		p = 0;
		while (1) {
			if ((p | 0) >= (o | 0)) break;
			c[n + (p << 2) >> 2] = c[a + (p << 1 << 2) >> 2];
			p = p + 1 | 0
		}
		p = 0;
		while (1) {
			if ((p | 0) >= (m | 0)) break;
			c[j + (p << 2) >> 2] = c[b + (p << 1 << 2) >> 2];
			p = p + 1 | 0
		}
		ob(n, j, s, o, 244, f);
		rb(s, j, o, 244, q);
		p = q + 4 | 0;
		j = d >> 1;
		o = 0;
		while (1) {
			if ((o | 0) == 489) break;
			m = s + (o << 2) | 0;
			g[m >> 2] = 0.0;
			d = o - (c[q >> 2] << 1) | 0;
			if (!((((d | 0) > -1 ? d : 0 - d | 0) | 0) > 2 ? (d = o - (c[p >> 2] << 1) | 0, (((d | 0) > -1 ? d : 0 - d | 0) | 0) > 2) : 0)) {
				n = 0;
				l = 0.0;
				r = 11
			}
			if ((r | 0) == 11) {
				while (1) {
					r = 0;
					if ((n | 0) >= (j | 0)) break;
					h = l + +g[a + (n << 2) >> 2] * +g[b + (o + n << 2) >> 2];
					n = n + 1 | 0;
					l = h;
					r = 11
				}
				g[m >> 2] = l < -1.0 ? -1.0 : l
			}
			o = o + 1 | 0
		}
		rb(s, b, j, 489, q);
		j = c[q >> 2] | 0;
		if (!((j | 0) > 0 & (j | 0) < 488)) {
			a = 0;
			q = j << 1;
			a = q - a | 0;
			c[e >> 2] = a;
			i = t;
			return
		}
		k = +g[s + (j + -1 << 2) >> 2];
		l = +g[s + (j << 2) >> 2];
		h = +g[s + (j + 1 << 2) >> 2];
		if (h - k > (l - k) * .699999988079071) {
			a = 1;
			q = j << 1;
			a = q - a | 0;
			c[e >> 2] = a;
			i = t;
			return
		}
		if (k - h > (l - h) * .699999988079071) {
			a = -1;
			q = j << 1;
			a = q - a | 0;
			c[e >> 2] = a;
			i = t;
			return
		}
		a = 0;
		q = j << 1;
		a = q - a | 0;
		c[e >> 2] = a;
		i = t;
		return
	}

	function qb(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = +f;
		h = h | 0;
		var j = 0.0,
			l = 0.0,
			m = 0.0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0,
			v = 0.0,
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
			I = 0;
		G = i;
		i = i + 2064 | 0;
		F = G + 2052 | 0;
		n = c[d >> 2] | 0;
		A = (n | 0) / 2 | 0;
		B = (e | 0) / 2 | 0;
		E = (b | 0) / 2 | 0;
		n = (n | 0) < 1024;
		z = n ? A : 511;
		c[d >> 2] = n ? A : 511;
		A = G;
		n = 512 - z | 0;
		b = 0;
		o = 0;
		e = 0;
		while (1) {
			if ((b | 0) >= (E | 0)) break;
			j = +g[a + (b + 512 << 2) >> 2];
			r = (g[k >> 2] = (c[k >> 2] = o, +g[k >> 2]) + j * j, c[k >> 2] | 0);
			t = (g[k >> 2] = (c[k >> 2] = e, +g[k >> 2]) + j * +g[a + (n + b << 2) >> 2], c[k >> 2] | 0);
			b = b + 1 | 0;
			o = r;
			e = t
		}
		c[A >> 2] = o;
		n = 1;
		b = o;
		while (1) {
			if ((n | 0) == 513) break;
			l = +g[a + (512 - n << 2) >> 2];
			j = +g[a + (E - n + 512 << 2) >> 2];
			j = (c[k >> 2] = b, +g[k >> 2]) + l * l - j * j;
			t = (g[k >> 2] = j, c[k >> 2] | 0);
			g[A + (n << 2) >> 2] = j < 0.0 ? 0.0 : j;
			n = n + 1 | 0;
			b = t
		}
		s = c[A + (z << 2) >> 2] | 0;
		j = (c[k >> 2] = e, +g[k >> 2]);
		v = (c[k >> 2] = o, +g[k >> 2]);
		j = j / +O(+(v * (c[k >> 2] = s, +g[k >> 2]) + 1.0));
		u = z << 1;
		v = v * 2.0;
		w = j * .699999988079071;
		x = j * .8500000238418579;
		y = f * .5;
		D = z;
		C = (g[k >> 2] = j, c[k >> 2] | 0);
		t = 2;
		while (1) {
			if ((t | 0) >= 16) break;
			o = t << 1;
			r = ((u + t | 0) >>> 0) / (o >>> 0) | 0;
			if ((r | 0) < 7) break;
			if ((t | 0) == 2) {
				q = r + z | 0;
				q = (q | 0) > 512 ? z : q
			} else q = (((_(c[22856 + (t << 2) >> 2] << 1, z) | 0) + t | 0) >>> 0) / (o >>> 0) | 0;
			o = 512 - r | 0;
			n = 512 - q | 0;
			b = 0;
			h = 0;
			p = 0;
			while (1) {
				if ((b | 0) >= (E | 0)) break;
				j = +g[a + (b + 512 << 2) >> 2];
				I = (g[k >> 2] = (c[k >> 2] = h, +g[k >> 2]) + j * +g[a + (o + b << 2) >> 2], c[k >> 2] | 0);
				H = (g[k >> 2] = (c[k >> 2] = p, +g[k >> 2]) + j * +g[a + (n + b << 2) >> 2], c[k >> 2] | 0);
				b = b + 1 | 0;
				h = I;
				p = H
			}
			l = (c[k >> 2] = p, +g[k >> 2]);
			l = (c[k >> 2] = h, +g[k >> 2]) + l;
			p = (g[k >> 2] = l, c[k >> 2] | 0);
			j = +g[A + (r << 2) >> 2] + +g[A + (q << 2) >> 2];
			n = (g[k >> 2] = j, c[k >> 2] | 0);
			j = l / +O(+(v * j + 1.0));
			o = (g[k >> 2] = j, c[k >> 2] | 0);
			b = r - B | 0;
			b = (b | 0) > -1 ? b : 0 - b | 0;
			if ((b | 0) >= 2)
				if ((b | 0) < 3) {
					h = (_(t * 5 | 0, t) | 0) < (z | 0);
					l = h ? y : 0.0
				} else l = 0.0;
			else l = f;
			m = w - l;
			m = m < .30000001192092896 ? .30000001192092896 : m;
			if ((r | 0) < 21) {
				m = x - l;
				if (m < .4000000059604645) m = .4000000059604645
			}
			if (j > m) {
				b = r;
				e = p
			} else {
				b = D;
				n = s;
				o = C
			}
			D = b;
			s = n;
			C = o;
			t = t + 1 | 0
		}
		m = (c[k >> 2] = e, +g[k >> 2]);
		m = m < 0.0 ? 0.0 : m;
		j = (c[k >> 2] = s, +g[k >> 2]);
		if (!(j <= m)) o = (g[k >> 2] = m / (j + 1.0), c[k >> 2] | 0);
		else o = 1065353216;
		h = 0;
		while (1) {
			if ((h | 0) == 3) break;
			b = 1 - (D + h) + 512 | 0;
			e = 0;
			n = 0;
			while (1) {
				if ((e | 0) >= (E | 0)) break;
				B = (g[k >> 2] = (c[k >> 2] = n, +g[k >> 2]) + +g[a + (e + 512 << 2) >> 2] * +g[a + (b + e << 2) >> 2], c[k >> 2] | 0);
				e = e + 1 | 0;
				n = B
			}
			c[F + (h << 2) >> 2] = n;
			h = h + 1 | 0
		}
		l = +g[F + 8 >> 2];
		m = +g[F >> 2];
		j = +g[F + 4 >> 2];
		if (l - m > (j - m) * .699999988079071) {
			E = 1;
			l = (c[k >> 2] = o, +g[k >> 2]);
			j = (c[k >> 2] = C, +g[k >> 2]);
			F = l > j;
			F = F ? C : o;
			C = D << 1;
			E = C + E | 0;
			C = (E | 0) < 15;
			E = C ? 15 : E;
			c[d >> 2] = E;
			j = (c[k >> 2] = F, +g[k >> 2]);
			i = G;
			return +j
		}
		if (m - l > (j - l) * .699999988079071) {
			E = -1;
			l = (c[k >> 2] = o, +g[k >> 2]);
			j = (c[k >> 2] = C, +g[k >> 2]);
			F = l > j;
			F = F ? C : o;
			C = D << 1;
			E = C + E | 0;
			C = (E | 0) < 15;
			E = C ? 15 : E;
			c[d >> 2] = E;
			j = (c[k >> 2] = F, +g[k >> 2]);
			i = G;
			return +j
		}
		E = 0;
		l = (c[k >> 2] = o, +g[k >> 2]);
		j = (c[k >> 2] = C, +g[k >> 2]);
		F = l > j;
		F = F ? C : o;
		C = D << 1;
		E = C + E | 0;
		C = (E | 0) < 15;
		E = C ? 15 : E;
		c[d >> 2] = E;
		j = (c[k >> 2] = F, +g[k >> 2]);
		i = G;
		return +j
	}

	function rb(a, b, d, e, f) {
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

	function sb(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0.0,
			f = 0,
			h = 0;
		h = c + -4 | 0;
		ob(a, a, b, h, 5, d);
		f = 0;
		while (1) {
			if ((f | 0) == 5) break;
			e = 0.0;
			d = f + h | 0;
			while (1) {
				if ((d | 0) >= (c | 0)) break;
				e = e + +g[a + (d << 2) >> 2] * +g[a + (d - f << 2) >> 2];
				d = d + 1 | 0
			}
			d = b + (f << 2) | 0;
			g[d >> 2] = +g[d >> 2] + e;
			f = f + 1 | 0
		}
		return
	}

	function tb(a, b, d, e, f, h, j, k, l, m, n, o, p, q, r, s, t) {
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
		p = p | 0;
		q = q | 0;
		r = r | 0;
		s = s | 0;
		t = t | 0;
		var u = 0.0,
			v = 0,
			w = 0.0,
			x = 0.0,
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
			T = 0.0;
		S = i;
		i = i + 96 | 0;
		O = S + 72 | 0;
		P = S + 48 | 0;
		Q = S + 24 | 0;
		R = S;
		if (!p)
			if ((r | 0) == 0 ? (v = d - b | 0, +g[q >> 2] > +(_(m << 1, v) | 0)) : 0) y = (_(v, m) | 0) < (o | 0);
			else y = 0;
		else y = 1;
		x = +(j >>> 0) * +g[q >> 2] * +(s | 0) / +(m << 9 | 0);
		N = a + 8 | 0;
		A = c[N >> 2] | 0;
		v = 0;
		u = 0.0;
		do {
			p = _(v, A) | 0;
			s = b;
			while (1) {
				if ((s | 0) >= (e | 0)) break;
				M = s + p | 0;
				T = +g[f + (M << 2) >> 2] - +g[h + (M << 2) >> 2];
				u = u + T * T;
				s = s + 1 | 0
			}
			v = v + 1 | 0
		} while ((v | 0) < (m | 0));
		M = ~~x;
		u = u > 200.0 ? 200.0 : u;
		K = l + 20 | 0;
		p = c[K >> 2] | 0;
		L = l + 28 | 0;
		s = c[L >> 2] | 0;
		J = p + ((aa(s | 0) | 0) + -32) | 0;
		e = (J + 3 | 0) >>> 0 > j >>> 0;
		v = e ? 0 : y & 1;
		e = e ? 0 : r;
		if (!((d - b | 0) > 10 ? (w = +(o | 0) * .125, !(w > 16.0)) : 0)) w = 16.0;
		x = (t | 0) == 0 ? w : 3.0;
		c[O >> 2] = c[l >> 2];
		c[O + 4 >> 2] = c[l + 4 >> 2];
		c[O + 8 >> 2] = c[l + 8 >> 2];
		c[O + 12 >> 2] = c[l + 12 >> 2];
		c[O + 16 >> 2] = c[l + 16 >> 2];
		c[O + 20 >> 2] = c[l + 20 >> 2];
		H = l + 24 | 0;
		E = c[H >> 2] | 0;
		I = l + 28 | 0;
		c[P >> 2] = c[I >> 2];
		c[P + 4 >> 2] = c[I + 4 >> 2];
		c[P + 8 >> 2] = c[I + 8 >> 2];
		c[P + 12 >> 2] = c[I + 12 >> 2];
		c[P + 16 >> 2] = c[I + 16 >> 2];
		D = _(A, m) | 0;
		F = i;
		i = i + ((1 * (D << 2) | 0) + 15 & -16) | 0;
		G = i;
		i = i + ((1 * (D << 2) | 0) + 15 & -16) | 0;
		nd(F | 0, h | 0, D << 2 | 0) | 0;
		D = (e | 0) == 0;
		if (D)
			if (!v) {
				C = E;
				e = 0
			} else {
				vb(a, b, d, f, F, j, J, 32371 + (n * 84 | 0) + 42 | 0, G, l, m, n, 1, x, t) | 0;
				B = 24
			}
		else {
			e = vb(a, b, d, f, F, j, J, 32371 + (n * 84 | 0) + 42 | 0, G, l, m, n, 1, x, t) | 0;
			if (!v) {
				p = c[K >> 2] | 0;
				s = c[L >> 2] | 0;
				C = c[H >> 2] | 0
			} else B = 24
		}
		if ((B | 0) == 24) {
			nd(h | 0, F | 0, (_(c[N >> 2] | 0, m) | 0) << 2 | 0) | 0;
			nd(k | 0, G | 0, (_(c[N >> 2] | 0, m) | 0) << 2 | 0) | 0;
			g[q >> 2] = u;
			i = S;
			return
		}
		A = 32 - (aa(s | 0) | 0) | 0;
		z = s >>> (A + -16 | 0);
		y = (z >>> 12) + -8 | 0;
		y = (p << 3) - ((A << 3) + (y + (z >>> 0 > (c[10984 + (y << 2) >> 2] | 0) >>> 0 & 1))) | 0;
		p = c[l >> 2] | 0;
		z = l + 4 | 0;
		c[Q >> 2] = c[z >> 2];
		c[Q + 4 >> 2] = c[z + 4 >> 2];
		c[Q + 8 >> 2] = c[z + 8 >> 2];
		c[Q + 12 >> 2] = c[z + 12 >> 2];
		c[Q + 16 >> 2] = c[z + 16 >> 2];
		c[R >> 2] = c[I >> 2];
		c[R + 4 >> 2] = c[I + 4 >> 2];
		c[R + 8 >> 2] = c[I + 8 >> 2];
		c[R + 12 >> 2] = c[I + 12 >> 2];
		c[R + 16 >> 2] = c[I + 16 >> 2];
		A = p + E | 0;
		o = C - E | 0;
		B = na() | 0;
		r = i;
		i = i + ((1 * ((C | 0) == (E | 0) ? 1 : o) | 0) + 15 & -16) | 0;
		nd(r | 0, A | 0, o | 0) | 0;
		c[l >> 2] = c[O >> 2];
		c[l + 4 >> 2] = c[O + 4 >> 2];
		c[l + 8 >> 2] = c[O + 8 >> 2];
		c[l + 12 >> 2] = c[O + 12 >> 2];
		c[l + 16 >> 2] = c[O + 16 >> 2];
		c[l + 20 >> 2] = c[O + 20 >> 2];
		c[H >> 2] = E;
		c[I >> 2] = c[P >> 2];
		c[I + 4 >> 2] = c[P + 4 >> 2];
		c[I + 8 >> 2] = c[P + 8 >> 2];
		c[I + 12 >> 2] = c[P + 12 >> 2];
		c[I + 16 >> 2] = c[P + 16 >> 2];
		s = vb(a, b, d, f, h, j, J, 32371 + (n * 84 | 0) + (v * 42 | 0) | 0, k, l, m, n, 0, x, t) | 0;
		a: do
			if (D) ya(B | 0);
			else {
				do
					if ((e | 0) >= (s | 0)) {
						if ((e | 0) == (s | 0) ? (J = c[L >> 2] | 0, E = 32 - (aa(J | 0) | 0) | 0, J = J >>> (E + -16 | 0), L = (J >>> 12) + -8 | 0, ((c[K >> 2] << 3) - ((E << 3) + (L + (J >>> 0 > (c[10984 + (L << 2) >> 2] | 0) >>> 0 & 1))) + M | 0) > (y | 0)) : 0) break;
						ya(B | 0);
						if (!v) break a;
						g[q >> 2] = u;
						i = S;
						return
					}
				while (0);
				c[l >> 2] = p;
				c[z >> 2] = c[Q >> 2];
				c[z + 4 >> 2] = c[Q + 4 >> 2];
				c[z + 8 >> 2] = c[Q + 8 >> 2];
				c[z + 12 >> 2] = c[Q + 12 >> 2];
				c[z + 16 >> 2] = c[Q + 16 >> 2];
				c[H >> 2] = C;
				c[I >> 2] = c[R >> 2];
				c[I + 4 >> 2] = c[R + 4 >> 2];
				c[I + 8 >> 2] = c[R + 8 >> 2];
				c[I + 12 >> 2] = c[R + 12 >> 2];
				c[I + 16 >> 2] = c[R + 16 >> 2];
				nd(A | 0, r | 0, o | 0) | 0;
				nd(h | 0, F | 0, (_(c[N >> 2] | 0, m) | 0) << 2 | 0) | 0;
				nd(k | 0, G | 0, (_(c[N >> 2] | 0, m) | 0) << 2 | 0) | 0;
				ya(B | 0);
				g[q >> 2] = u;
				i = S;
				return
			}
		while (0);
		w = +g[23020 + (n << 2) >> 2];
		u = w * w * +g[q >> 2] + u;
		g[q >> 2] = u;
		i = S;
		return
	}

	function ub(a, b, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0.0;
		i = a + 8 | 0;
		j = 0;
		do {
			a = 0;
			while (1) {
				if ((a | 0) >= (b | 0)) {
					a = b;
					break
				}
				k = a + (_(j, c[i >> 2] | 0) | 0) | 0;
				l = +Y(+(+g[e + (k << 2) >> 2])) * 1.4426950408889634;
				g[f + (k << 2) >> 2] = l - +g[22920 + (a << 2) >> 2];
				a = a + 1 | 0
			}
			while (1) {
				if ((a | 0) >= (d | 0)) break;
				g[f + ((_(j, c[i >> 2] | 0) | 0) + a << 2) >> 2] = -14.0;
				a = a + 1 | 0
			}
			j = j + 1 | 0
		} while ((j | 0) < (h | 0));
		return
	}

	function vb(a, b, e, f, h, j, l, m, n, o, p, q, r, s, t) {
		a = a | 0;
		b = b | 0;
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
		s = +s;
		t = t | 0;
		var u = 0,
			v = 0,
			w = 0,
			x = 0.0,
			y = 0.0,
			z = 0,
			A = 0,
			B = 0.0,
			C = 0,
			D = 0.0,
			E = 0,
			F = 0.0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0,
			L = 0,
			N = 0,
			O = 0,
			P = 0,
			Q = 0,
			R = 0.0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Y = 0,
			Z = 0;
		Y = i;
		i = i + 16 | 0;
		W = Y;
		L = W;
		c[L >> 2] = 0;
		c[L + 4 >> 2] = 0;
		a: do
			if ((l + 3 | 0) <= (j | 0)) {
				u = c[o + 28 >> 2] | 0;
				v = u >>> 3;
				u = u - v | 0;
				l = o + 32 | 0;
				if (r) {
					L = o + 32 | 0;
					c[L >> 2] = (c[l >> 2] | 0) + u;
					l = L;
					u = v
				}
				v = o + 28 | 0;
				c[v >> 2] = u;
				w = o + 20 | 0;
				while (1) {
					if (u >>> 0 >= 8388609) break a;
					lb(o, (c[l >> 2] | 0) >>> 23);
					c[l >> 2] = c[l >> 2] << 8 & 2147483392;
					u = c[v >> 2] << 8;
					c[v >> 2] = u;
					c[w >> 2] = (c[w >> 2] | 0) + 8
				}
			}
		while (0);
		if (!r) {
			r = c[23036 + (q << 2) >> 2] | 0;
			l = c[23020 + (q << 2) >> 2] | 0
		} else {
			r = 1041864704;
			l = 0
		}
		V = a + 8 | 0;
		R = (c[k >> 2] = l, +g[k >> 2]);
		S = o + 20 | 0;
		T = o + 28 | 0;
		U = p * 3 | 0;
		N = (t | 0) == 0;
		O = o + 28 | 0;
		P = o + 32 | 0;
		Q = o + 20 | 0;
		F = (c[k >> 2] = r, +g[k >> 2]);
		G = o + 32 | 0;
		a = 0;
		L = b;
		while (1) {
			if ((L | 0) >= (e | 0)) break;
			H = _(U, e - L | 0) | 0;
			I = (L | 0) != (b | 0);
			J = (L | 0) < 20;
			K = (L | 0) > 1;
			E = 0;
			do {
				C = L + (_(E, c[V >> 2] | 0) | 0) | 0;
				x = +g[f + (C << 2) >> 2];
				y = +g[h + (C << 2) >> 2];
				B = R * (y < -9.0 ? -9.0 : y);
				C = W + (E << 2) | 0;
				D = x - B - +g[C >> 2];
				t = ~~+M(+(D + .5));
				y = (y < -28.0 ? -28.0 : y) - s;
				if ((t | 0) < 0 & x < y) {
					A = t + ~~(y - x) | 0;
					A = (A | 0) > 0 ? 0 : A
				} else A = t;
				z = c[T >> 2] | 0;
				r = (c[S >> 2] | 0) + ((aa(z | 0) | 0) + -32) | 0;
				w = j - r | 0;
				q = w - H | 0;
				if (I & (q | 0) < 30 & (q | 0) < 24) {
					t = (A | 0) > 1 ? 1 : A;
					if ((q | 0) < 16) t = (t | 0) < -1 ? -1 : t
				} else t = A;
				t = N | K ^ 1 ? t : (t | 0) < 0 ? t : 0;
				b: do
					if ((w | 0) <= 14) {
						if ((w | 0) > 1) {
							t = (t | 0) < 1 ? ((t | 0) < -1 ? -1 : t) : 1;
							hb(o, t << 1 ^ t >> 31, 32707, 2);
							break
						}
						if ((r | 0) < (j | 0)) {
							q = z >>> 1;
							r = z - q | 0;
							if ((t | 0) <= 0)
								if (!t) q = r;
								else c[P >> 2] = (c[G >> 2] | 0) + r;
							else {
								q = r;
								t = 0
							}
							c[O >> 2] = q;
							while (1) {
								if (q >>> 0 >= 8388609) break b;
								lb(o, (c[P >> 2] | 0) >>> 23);
								c[P >> 2] = c[P >> 2] << 8 & 2147483392;
								q = c[O >> 2] << 8;
								c[O >> 2] = q;
								c[Q >> 2] = (c[Q >> 2] | 0) + 8
							}
						} else t = -1
					} else {
						v = (J ? L : 20) << 1;
						q = (d[m + v >> 0] | 0) << 7;
						v = (d[m + (v | 1) >> 0] | 0) << 6;
						if (t) {
							l = t >> 31;
							w = t + l ^ l;
							r = (_(32736 - q | 0, 16384 - v | 0) | 0) >>> 15;
							u = 1;
							while (1) {
								if (!((r | 0) != 0 & (w | 0) > (u | 0))) break;
								Z = r << 1;
								r = (_(Z, v) | 0) >>> 15;
								q = q + (Z + 2) | 0;
								u = u + 1 | 0
							}
							if (!r) {
								w = w - u | 0;
								t = (32768 - q - l >> 1) + -1 | 0;
								t = (w | 0) < (t | 0) ? w : t;
								q = q + ((t << 1 | 1) + l) | 0;
								w = 32768 - q | 0;
								w = w >>> 0 > 1 ? 1 : w;
								t = u + t + l ^ l
							} else {
								u = r + 1 | 0;
								w = u;
								q = q + (u & ~l) | 0
							}
							r = z >>> 15;
							if (!q) X = 28;
							else {
								q = (c[O >> 2] | 0) - (_(r, 32768 - q | 0) | 0) | 0;
								c[P >> 2] = (c[P >> 2] | 0) + q;
								q = _(r, w) | 0
							}
						} else {
							w = q;
							r = z >>> 15;
							q = 0;
							t = 0;
							X = 28
						}
						if ((X | 0) == 28) {
							X = 0;
							q = _(r, 32768 - (q + w) | 0) | 0;
							q = (c[O >> 2] | 0) - q | 0
						}
						c[O >> 2] = q;
						while (1) {
							if (q >>> 0 >= 8388609) break b;
							lb(o, (c[P >> 2] | 0) >>> 23);
							c[P >> 2] = c[P >> 2] << 8 & 2147483392;
							q = c[O >> 2] << 8;
							c[O >> 2] = q;
							c[Q >> 2] = (c[Q >> 2] | 0) + 8
						}
					}
				while (0);
				x = +(t | 0);
				g[n + (L + (_(E, c[V >> 2] | 0) | 0) << 2) >> 2] = D - x;
				l = A - t | 0;
				a = a + ((l | 0) > -1 ? l : 0 - l | 0) | 0;
				y = +g[C >> 2];
				g[h + (L + (_(E, c[V >> 2] | 0) | 0) << 2) >> 2] = B + y + x;
				g[C >> 2] = y + x - F * x;
				E = E + 1 | 0
			} while ((E | 0) < (p | 0));
			L = L + 1 | 0
		}
		i = Y;
		return (N ? a : 0) | 0
	}

	function wb(a, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t, u, v) {
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
		u = u | 0;
		v = v | 0;
		var w = 0,
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
		w = (m | 0) > 0 ? m : 0;
		C = c[a + 8 >> 2] | 0;
		Q = (w | 0) > 7 ? 8 : 0;
		w = w - Q | 0;
		U = (r | 0) == 2;
		if (U ? (x = d[32710 + (f - e) >> 0] | 0, (w | 0) >= (x | 0)) : 0) {
			w = w - x | 0;
			R = (w | 0) > 7 ? 8 : 0;
			w = w - R | 0
		} else {
			R = 0;
			x = 0
		}
		L = i;
		i = i + ((1 * (C << 2) | 0) + 15 & -16) | 0;
		M = i;
		i = i + ((1 * (C << 2) | 0) + 15 & -16) | 0;
		O = i;
		i = i + ((1 * (C << 2) | 0) + 15 & -16) | 0;
		D = i;
		i = i + ((1 * (C << 2) | 0) + 15 & -16) | 0;
		S = r << 3;
		T = a + 32 | 0;
		y = j + -5 - s | 0;
		j = s + 3 | 0;
		B = e;
		while (1) {
			if ((B | 0) >= (f | 0)) break;
			m = B + 1 | 0;
			z = c[T >> 2] | 0;
			z = ((b[z + (m << 1) >> 1] | 0) - (b[z + (B << 1) >> 1] | 0) | 0) * 3 << s << 3 >> 4;
			c[O + (B << 2) >> 2] = (S | 0) > (z | 0) ? S : z;
			z = c[T >> 2] | 0;
			z = (_(_(_((b[z + (m << 1) >> 1] | 0) - (b[z + (B << 1) >> 1] | 0) | 0, r) | 0, y) | 0, f - B + -1 | 0) | 0) << j >> 6;
			A = D + (B << 2) | 0;
			c[A >> 2] = z;
			N = c[T >> 2] | 0;
			if (((b[N + (m << 1) >> 1] | 0) - (b[N + (B << 1) >> 1] | 0) << s | 0) != 1) {
				B = m;
				continue
			}
			c[A >> 2] = z - S;
			B = m
		}
		J = a + 48 | 0;
		I = a + 52 | 0;
		m = (c[J >> 2] | 0) + -1 | 0;
		j = 1;
		do {
			H = j + m >> 1;
			G = _(H, C) | 0;
			E = 1;
			B = f;
			A = 0;
			a: while (1) {
				b: while (1) {
					F = B;
					do {
						B = F;
						F = F + -1 | 0;
						if ((B | 0) <= (e | 0)) break a;
						N = c[T >> 2] | 0;
						B = _((b[N + (B << 1) >> 1] | 0) - (b[N + (F << 1) >> 1] | 0) | 0, r) | 0;
						B = (_(B, d[(c[I >> 2] | 0) + (G + F) >> 0] | 0) | 0) << s >> 2;
						if ((B | 0) > 0) {
							B = B + (c[D + (F << 2) >> 2] | 0) | 0;
							B = (B | 0) < 0 ? 0 : B
						}
						z = B + (c[g + (F << 2) >> 2] | 0) | 0;
						if ((z | 0) < (c[O + (F << 2) >> 2] | 0) ^ 1 | E ^ 1) break b
					} while ((z | 0) < (S | 0));
					B = F;
					A = A + S | 0
				}
				N = c[h + (F << 2) >> 2] | 0;E = 0;B = F;A = A + ((z | 0) < (N | 0) ? z : N) | 0
			}
			N = (A | 0) > (w | 0);
			j = N ? j : H + 1 | 0;
			m = N ? H + -1 | 0 : m
		} while ((j | 0) <= (m | 0));
		m = _(j + -1 | 0, C) | 0;
		G = _(j, C) | 0;
		F = (j | 0) > 1;
		K = e;
		H = e;
		while (1) {
			if ((H | 0) >= (f | 0)) break;
			E = H + 1 | 0;
			B = c[T >> 2] | 0;
			B = _((b[B + (E << 1) >> 1] | 0) - (b[B + (H << 1) >> 1] | 0) | 0, r) | 0;
			A = c[I >> 2] | 0;
			C = (_(B, d[A + (m + H) >> 0] | 0) | 0) << s >> 2;
			if ((j | 0) < (c[J >> 2] | 0)) B = (_(B, d[A + (G + H) >> 0] | 0) | 0) << s >> 2;
			else B = c[h + (H << 2) >> 2] | 0;
			if ((C | 0) > 0) {
				A = C + (c[D + (H << 2) >> 2] | 0) | 0;
				A = (A | 0) < 0 ? 0 : A
			} else A = C;
			if ((B | 0) > 0) {
				B = B + (c[D + (H << 2) >> 2] | 0) | 0;
				B = (B | 0) < 0 ? 0 : B
			}
			N = c[g + (H << 2) >> 2] | 0;
			y = F ? A + N | 0 : A;
			z = B + N | 0;
			c[L + (H << 2) >> 2] = y;
			c[M + (H << 2) >> 2] = (z | 0) < (y | 0) ? 0 : z - y | 0;
			K = (N | 0) > 0 ? H : K;
			H = E
		}
		g = (r | 0) > 1;
		P = g & 1;
		m = 64;
		G = 0;
		C = 0;
		while (1) {
			if ((C | 0) == 6) break;
			y = G + m >> 1;
			j = 1;
			B = f;
			A = 0;
			c: while (1) {
				d: while (1) {
					do {
						N = B;
						B = B + -1 | 0;
						if ((N | 0) <= (e | 0)) break c;
						z = (c[L + (B << 2) >> 2] | 0) + ((_(y, c[M + (B << 2) >> 2] | 0) | 0) >> 6) | 0;
						if ((z | 0) < (c[O + (B << 2) >> 2] | 0) ^ 1 | j ^ 1) break d
					} while ((z | 0) < (S | 0));
					A = A + S | 0
				}
				N = c[h + (B << 2) >> 2] | 0;j = 0;A = A + ((z | 0) < (N | 0) ? z : N) | 0
			}
			N = (A | 0) > (w | 0);
			m = N ? y : m;
			G = N ? G : y;
			C = C + 1 | 0
		}
		N = s << 3;
		A = 0;
		z = f;
		H = 0;
		while (1) {
			y = z + -1 | 0;
			if ((z | 0) <= (e | 0)) break;
			I = (c[L + (y << 2) >> 2] | 0) + ((_(G, c[M + (y << 2) >> 2] | 0) | 0) >> 6) | 0;
			z = (A | 0) == 0 ? (I | 0) < (c[O + (y << 2) >> 2] | 0) : 0;
			I = z ? ((I | 0) < (S | 0) ? 0 : S) : I;
			J = c[h + (y << 2) >> 2] | 0;
			J = (I | 0) < (J | 0) ? I : J;
			c[o + (y << 2) >> 2] = J;
			A = z ? 0 : 1;
			z = y;
			H = H + J | 0
		}
		j = S + 8 | 0;
		z = t + 28 | 0;
		A = t + 32 | 0;
		y = e + 2 | 0;
		D = t + 28 | 0;
		I = t + 32 | 0;
		J = t + 20 | 0;
		M = f;
		while (1) {
			E = M + -1 | 0;
			if ((E | 0) <= (K | 0)) {
				C = 46;
				break
			}
			G = w - H | 0;
			C = c[T >> 2] | 0;
			m = b[C + (M << 1) >> 1] | 0;
			F = b[C + (e << 1) >> 1] | 0;
			B = m - F | 0;
			L = (G >>> 0) / (B >>> 0) | 0;
			B = G - (_(B, L) | 0) | 0;
			C = b[C + (E << 1) >> 1] | 0;
			F = B + (F - C) | 0;
			C = m - C | 0;
			m = o + (E << 2) | 0;
			B = c[m >> 2] | 0;
			F = B + (_(L, C) | 0) + ((F | 0) > 0 ? F : 0) | 0;
			L = c[O + (E << 2) >> 2] | 0;
			if ((F | 0) < (((L | 0) > (j | 0) ? L : j) | 0)) {
				G = B;
				B = H
			} else {
				if ((M | 0) <= (y | 0)) {
					C = 50;
					break
				}
				if (!((E | 0) > (v | 0) ? 1 : (F | 0) <= ((_((M | 0) <= (u | 0) ? 7 : 9, C) | 0) << s << 3 >> 4 | 0))) {
					C = 50;
					break
				}
				B = c[z >> 2] | 0;
				B = B - (B >>> 1) | 0;
				c[D >> 2] = B;
				while (1) {
					if (B >>> 0 >= 8388609) break;
					lb(t, (c[I >> 2] | 0) >>> 23);
					c[I >> 2] = c[I >> 2] << 8 & 2147483392;
					B = c[D >> 2] << 8;
					c[D >> 2] = B;
					c[J >> 2] = (c[J >> 2] | 0) + 8
				}
				G = c[m >> 2] | 0;
				F = F + -8 | 0;
				B = H + 8 | 0
			}
			if ((x | 0) > 0) C = d[32710 + (E - e) >> 0] | 0;
			else C = x;
			H = B - (G + x) + C | 0;
			M = (F | 0) < (S | 0);
			c[m >> 2] = M ? 0 : S;
			x = C;
			H = M ? H : H + S | 0;
			M = E
		}
		e: do
			if ((C | 0) == 46) w = w + Q | 0;
			else
		if ((C | 0) == 50) {
			O = c[z >> 2] | 0;
			j = O >>> 1;
			c[I >> 2] = (c[A >> 2] | 0) + (O - j);
			c[D >> 2] = j;
			while (1) {
				if (j >>> 0 >= 8388609) break e;
				lb(t, (c[I >> 2] | 0) >>> 23);
				c[I >> 2] = c[I >> 2] << 8 & 2147483392;
				j = c[D >> 2] << 8;
				c[D >> 2] = j;
				c[J >> 2] = (c[J >> 2] | 0) + 8
			}
		}
		while (0);
		if ((x | 0) > 0) {
			O = c[k >> 2] | 0;
			O = (O | 0) < (M | 0) ? O : M;
			c[k >> 2] = O;
			ib(t, O - e | 0, M + 1 - e | 0)
		} else c[k >> 2] = 0;
		f: do
			if ((c[k >> 2] | 0) > (e | 0))
				if (!R) C = 71;
				else {
					j = c[z >> 2] | 0;
					x = j >>> 1;
					j = j - x | 0;
					if (!(c[l >> 2] | 0)) x = j;
					else c[I >> 2] = (c[A >> 2] | 0) + j;
					c[D >> 2] = x;
					while (1) {
						if (x >>> 0 >= 8388609) break f;
						lb(t, (c[I >> 2] | 0) >>> 23);
						c[I >> 2] = c[I >> 2] << 8 & 2147483392;
						x = c[D >> 2] << 8;
						c[D >> 2] = x;
						c[J >> 2] = (c[J >> 2] | 0) + 8
					}
				}
		else {
			w = w + R | 0;
			C = 71
		}
		while (0);
		if ((C | 0) == 71) c[l >> 2] = 0;
		w = w - H | 0;
		j = c[T >> 2] | 0;
		j = (b[j + (M << 1) >> 1] | 0) - (b[j + (e << 1) >> 1] | 0) | 0;
		m = (w >>> 0) / (j >>> 0) | 0;
		j = _(j, m) | 0;
		x = e;
		while (1) {
			if ((x | 0) >= (M | 0)) break;
			O = x + 1 | 0;
			K = c[T >> 2] | 0;
			K = _(m, (b[K + (O << 1) >> 1] | 0) - (b[K + (x << 1) >> 1] | 0) | 0) | 0;
			L = o + (x << 2) | 0;
			c[L >> 2] = (c[L >> 2] | 0) + K;
			x = O
		}
		m = w - j | 0;
		w = e;
		while (1) {
			if ((w | 0) >= (M | 0)) break;
			O = w + 1 | 0;
			L = c[T >> 2] | 0;
			L = (b[L + (O << 1) >> 1] | 0) - (b[L + (w << 1) >> 1] | 0) | 0;
			L = (m | 0) < (L | 0) ? m : L;
			K = o + (w << 2) | 0;
			c[K >> 2] = (c[K >> 2] | 0) + L;
			m = m - L | 0;
			w = O
		}
		H = a + 56 | 0;
		z = g ? 4 : 3;
		D = (M | 0) > (e | 0);
		F = 0;
		G = e;
		while (1) {
			if ((G | 0) >= (M | 0)) break;
			E = G + 1 | 0;
			y = c[T >> 2] | 0;
			y = (b[y + (E << 1) >> 1] | 0) - (b[y + (G << 1) >> 1] | 0) << s;
			C = o + (G << 2) | 0;
			j = (c[C >> 2] | 0) + F | 0;
			if ((y | 0) > 1) {
				x = c[h + (G << 2) >> 2] | 0;
				x = (j | 0) > (x | 0) ? j - x | 0 : 0;
				B = j - x | 0;
				c[C >> 2] = B;
				j = _(y, r) | 0;
				if (U & (y | 0) > 2 ? (c[l >> 2] | 0) == 0 : 0) w = (G | 0) < (c[k >> 2] | 0);
				else w = 0;
				A = j + (w & 1) | 0;
				m = _(A, (b[(c[H >> 2] | 0) + (G << 1) >> 1] | 0) + N | 0) | 0;
				j = (m >> 1) + (_(A, -21) | 0) | 0;
				if ((y | 0) == 2) j = j + (A << 3 >> 2) | 0;
				w = B + j | 0;
				if ((w | 0) >= (A << 4 | 0))
					if ((w | 0) < (A * 24 | 0)) y = j + (m >> 3) | 0;
					else y = j;
				else y = j + (m >> 2) | 0;
				j = B + y + (A << 2) | 0;
				m = p + (G << 2) | 0;
				j = ((((j | 0) < 0 ? 0 : j) >>> 0) / (A >>> 0) | 0) >>> 3;
				c[m >> 2] = j;
				O = _(j, r) | 0;
				w = c[C >> 2] | 0;
				if ((O | 0) > (w >> 3 | 0)) {
					j = w >> P >> 3;
					c[m >> 2] = j
				}
				O = (j | 0) < 8 ? j : 8;
				c[m >> 2] = O;
				O = _(O, A << 3) | 0;
				c[q + (G << 2) >> 2] = (O | 0) >= ((c[C >> 2] | 0) + y | 0) & 1;
				O = (_(c[m >> 2] | 0, r) | 0) << 3;
				c[C >> 2] = (c[C >> 2] | 0) - O
			} else {
				x = (j | 0) < (S | 0) ? 0 : j - S | 0;
				c[C >> 2] = j - x;
				c[p + (G << 2) >> 2] = 0;
				c[q + (G << 2) >> 2] = 1
			}
			if ((x | 0) <= 0) {
				F = x;
				G = E;
				continue
			}
			g = x >> z;
			L = p + (G << 2) | 0;
			K = c[L >> 2] | 0;
			O = 8 - K | 0;
			O = (g | 0) < (O | 0) ? g : O;
			c[L >> 2] = K + O;
			O = (_(O, r) | 0) << 3;
			c[q + (G << 2) >> 2] = (O | 0) >= (x - F | 0) & 1;
			F = x - O | 0;
			G = E
		}
		c[n >> 2] = F;
		m = D ? M : e;
		while (1) {
			if ((m | 0) >= (f | 0)) break;
			N = o + (m << 2) | 0;
			O = p + (m << 2) | 0;
			c[O >> 2] = c[N >> 2] >> P >> 3;
			c[N >> 2] = 0;
			c[q + (m << 2) >> 2] = (c[O >> 2] | 0) < 1 & 1;
			m = m + 1 | 0
		}
		i = V;
		return M | 0
	}

	function xb(a, b, d, e, f, h) {
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
		zb(a, b, 1, f, d, e);
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
			e = e + (c[(c[5836 + (((l | 0) < (o | 0) ? l : o) << 2) >> 2] | 0) + (((l | 0) > (o | 0) ? l : o) << 2) >> 2] | 0) | 0;
			v = c[w + (m << 2) >> 2] | 0;
			o = o + ((v | 0) > -1 ? v : 0 - v | 0) | 0;
			if ((v | 0) < 0) {
				v = o + 1 | 0;
				e = e + (c[(c[5836 + (((l | 0) < (v | 0) ? l : v) << 2) >> 2] | 0) + (((l | 0) > (v | 0) ? l : v) << 2) >> 2] | 0) | 0
			}
		} while ((n | 0) > 1);
		v = d + 1 | 0;
		ib(h, e, (c[(c[5836 + (((b | 0) < (d | 0) ? b : d) << 2) >> 2] | 0) + (((b | 0) > (d | 0) ? b : d) << 2) >> 2] | 0) + (c[(c[5836 + (((d | 0) < (b | 0) ? v : b) << 2) >> 2] | 0) + (((v | 0) < (b | 0) ? b : v) << 2) >> 2] | 0) | 0);
		v = Ab(w, b, f) | 0;
		i = x;
		return v | 0
	}

	function yb(a, b, d, e, f, h, j) {
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
		o = db(h, (c[(c[5836 + (((b | 0) < (d | 0) ? b : d) << 2) >> 2] | 0) + (((b | 0) > (d | 0) ? b : d) << 2) >> 2] | 0) + (c[(c[5836 + (((d | 0) < (b | 0) ? o : b) << 2) >> 2] | 0) + (((o | 0) < (b | 0) ? b : o) << 2) >> 2] | 0) | 0) | 0;
		r = s;
		k = 0.0;
		while (1) {
			if ((p | 0) <= 2) break;
			do
				if ((q | 0) < (p | 0)) {
					h = c[(c[5836 + (q << 2) >> 2] | 0) + (p << 2) >> 2] | 0;
					l = c[(c[5836 + (q + 1 << 2) >> 2] | 0) + (p << 2) >> 2] | 0;
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
						m = c[(c[5836 + (h << 2) >> 2] | 0) + (p << 2) >> 2] | 0
					} while (l >>> 0 < m >>> 0);
					o = n << 31 >> 31;
					q = q - h + o ^ o;
					c[r >> 2] = q << 16 >> 16;
					u = +((q & 65535) << 16 >> 16);
					m = l - m | 0;
					k = k + u * u
				} else {
					l = c[5836 + (p << 2) >> 2] | 0;
					m = c[l + (q + 1 << 2) >> 2] | 0;
					h = o >>> 0 >= m >>> 0;
					n = h << 31 >> 31;
					o = o - (h ? m : 0) | 0;
					a: do
						if ((c[l + (p << 2) >> 2] | 0) >>> 0 > o >>> 0) {
							h = p;
							do {
								h = h + -1 | 0;
								m = c[(c[5836 + (h << 2) >> 2] | 0) + (p << 2) >> 2] | 0
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
		zb(a, b, -1, f, d, e);
		f = Ab(s, b, f) | 0;
		i = t;
		return f | 0
	}

	function zb(a, b, d, e, f, g) {
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
		m = +(b | 0) / +((_(c[23052 + (g + -1 << 2) >> 2] | 0, f) | 0) + b | 0);
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
				Bb(b, k, 1, l, h);
				if (!d) Bb(b, k, f, m, i)
			} else {
				if (!d) Bb(b, k, f, m, l);
				Bb(b, k, 1, l, m)
			}
			j = j + 1 | 0
		}
		return
	}

	function Ab(a, b, d) {
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

	function Bb(a, b, c, d, e) {
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

	function Cb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		id(a | 0, 0, 24568) | 0;
		e = 0;
		f = 0;
		while (1) {
			if ((f | 0) == 2) break;
			e = e + (Qb(a + (f * 12240 | 0) | 0, b) | 0) | 0;
			f = f + 1 | 0
		}
		c[a + 24544 >> 2] = 1;
		b = a + 24548 | 0;
		c[b >> 2] = 1;
		c[d >> 2] = c[a + 24544 >> 2];
		c[d + 4 >> 2] = c[b >> 2];
		c[d + 8 >> 2] = c[a + 4580 >> 2];
		c[d + 12 >> 2] = c[a + 4588 >> 2];
		c[d + 16 >> 2] = c[a + 4592 >> 2];
		c[d + 20 >> 2] = c[a + 4596 >> 2];
		c[d + 24 >> 2] = c[a + 4636 >> 2];
		c[d + 28 >> 2] = c[a + 4632 >> 2];
		c[d + 32 >> 2] = c[a + 4640 >> 2];
		c[d + 36 >> 2] = c[a + 4648 >> 2];
		c[d + 40 >> 2] = c[a + 6120 >> 2];
		c[d + 44 >> 2] = c[a + 6108 >> 2];
		c[d + 48 >> 2] = c[a + 4708 >> 2];
		b = a + 4600 | 0;
		c[d + 68 >> 2] = (c[b >> 2] << 16 >> 16) * 1e3;
		c[d + 72 >> 2] = c[a + 4560 >> 2];
		if ((c[b >> 2] | 0) != 16) {
			a = 0;
			a = a & 1;
			b = d + 76 | 0;
			c[b >> 2] = a;
			return e | 0
		}
		a = (c[a + 28 >> 2] | 0) == 0;
		a = a & 1;
		b = d + 76 | 0;
		c[b >> 2] = a;
		return e | 0
	}

	function Db(f, g, h, j, k, l, m) {
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
			va = 0,
			wa = 0,
			xa = 0,
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
			Ka = 0,
			La = 0,
			Ma = 0,
			Na = 0,
			Oa = 0,
			Pa = 0,
			Qa = 0,
			Ra = 0,
			Sa = 0,
			Ta = 0,
			Ua = 0,
			Va = 0,
			Wa = 0;
		Wa = i;
		i = i + 16 | 0;
		Ta = Wa;
		Ua = Wa + 8 | 0;
		if (c[g + 64 >> 2] | 0) {
			c[f + 4696 >> 2] = 1;
			c[f + 16936 >> 2] = 1
		}
		c[f + 18020 >> 2] = 0;
		Sa = f + 5780 | 0;
		c[Sa >> 2] = 0;
		r = g + 8 | 0;
		o = c[r >> 2] | 0;
		a: do
			if ((o | 0) < 24e3) {
				if ((o | 0) < 12e3) {
					switch (o | 0) {
						case 8e3:
							break a;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				}
				if ((o | 0) < 16e3) {
					switch (o | 0) {
						case 12e3:
							break a;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				} else {
					switch (o | 0) {
						case 16e3:
							break a;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				}
			} else
		if ((o | 0) < 44100)
			if ((o | 0) < 32e3) {
				switch (o | 0) {
					case 24e3:
						break a;
					default:
						n = -102
				}
				i = Wa;
				return n | 0
			} else {
				switch (o | 0) {
					case 32e3:
						break a;
					default:
						n = -102
				}
				i = Wa;
				return n | 0
			}
		else if ((o | 0) < 48e3) {
			switch (o | 0) {
				case 44100:
					break a;
				default:
					n = -102
			}
			i = Wa;
			return n | 0
		} else {
			switch (o | 0) {
				case 48e3:
					break a;
				default:
					n = -102
			}
			i = Wa;
			return n | 0
		}
		while (0);
		o = c[g + 20 >> 2] | 0;
		b: do
			if ((o | 0) >= 12e3)
				if ((o | 0) < 16e3) {
					switch (o | 0) {
						case 12e3:
							break b;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				} else {
					switch (o | 0) {
						case 16e3:
							break b;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				}
		else {
			switch (o | 0) {
				case 8e3:
					break b;
				default:
					n = -102
			}
			i = Wa;
			return n | 0
		}
		while (0);
		p = c[g + 12 >> 2] | 0;
		c: do
			if ((p | 0) >= 12e3)
				if ((p | 0) < 16e3) {
					switch (p | 0) {
						case 12e3:
							break c;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				} else {
					switch (p | 0) {
						case 16e3:
							break c;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				}
		else {
			switch (p | 0) {
				case 8e3:
					break c;
				default:
					n = -102
			}
			i = Wa;
			return n | 0
		}
		while (0);
		q = c[g + 16 >> 2] | 0;
		d: do
			if ((q | 0) >= 12e3)
				if ((q | 0) < 16e3) {
					switch (q | 0) {
						case 12e3:
							break d;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				} else {
					switch (q | 0) {
						case 16e3:
							break d;
						default:
							n = -102
					}
					i = Wa;
					return n | 0
				}
		else {
			switch (q | 0) {
				case 8e3:
					break d;
				default:
					n = -102
			}
			i = Wa;
			return n | 0
		}
		while (0);
		if ((q | 0) > (o | 0) | (p | 0) < (o | 0) | (q | 0) > (p | 0)) {
			fa = -102;
			i = Wa;
			return fa | 0
		}
		Ra = g + 24 | 0;
		switch (c[Ra >> 2] | 0) {
			case 60:
			case 40:
			case 20:
			case 10:
				break;
			default:
				{
					fa = -103;i = Wa;
					return fa | 0
				}
		}
		fa = c[g + 32 >> 2] | 0;
		if ((fa | 0) < 0 | (fa | 0) > 100) {
			fa = -105;
			i = Wa;
			return fa | 0
		}
		S = g + 44 | 0;
		fa = c[S >> 2] | 0;
		if ((fa | 0) < 0 | (fa | 0) > 1) {
			fa = -108;
			i = Wa;
			return fa | 0
		}
		Pa = g + 48 | 0;
		fa = c[Pa >> 2] | 0;
		if ((fa | 0) < 0 | (fa | 0) > 1) {
			fa = -109;
			i = Wa;
			return fa | 0
		}
		fa = c[g + 40 >> 2] | 0;
		if ((fa | 0) < 0 | (fa | 0) > 1) {
			fa = -107;
			i = Wa;
			return fa | 0
		}
		q = c[g >> 2] | 0;
		if ((q | 0) < 1 | (q | 0) > 2) {
			fa = -111;
			i = Wa;
			return fa | 0
		}
		Va = g + 4 | 0;
		p = c[Va >> 2] | 0;
		if ((p | 0) < 1 | (p | 0) > 2 | (p | 0) > (q | 0)) {
			fa = -111;
			i = Wa;
			return fa | 0
		}
		Qa = g + 36 | 0;
		fa = c[Qa >> 2] | 0;
		if ((fa | 0) < 0 | (fa | 0) > 10) {
			fa = -106;
			i = Wa;
			return fa | 0
		}
		c[g + 84 >> 2] = 0;
		q = f + 24548 | 0;
		if ((p | 0) > (c[q >> 2] | 0)) {
			p = Qb(f + 12240 | 0, c[f + 5124 >> 2] | 0) | 0;
			fa = f + 24480 | 0;
			b[fa >> 1] = 0;
			b[fa + 2 >> 1] = 0 >>> 16;
			fa = f + 24488 | 0;
			b[fa >> 1] = 0;
			b[fa + 2 >> 1] = 0 >>> 16;
			c[f + 24492 >> 2] = 0;
			c[f + 24496 >> 2] = 1;
			c[f + 24500 >> 2] = 0;
			c[f + 24504 >> 2] = 1;
			b[f + 24510 >> 1] = 0;
			b[f + 24508 >> 1] = 16384;
			if ((c[f + 24544 >> 2] | 0) == 2) {
				nd(f + 18048 | 0, f + 5808 | 0, 300) | 0;
				da = f;
				ea = c[da + 4 >> 2] | 0;
				fa = f + 12240 | 0;
				c[fa >> 2] = c[da >> 2];
				c[fa + 4 >> 2] = ea
			}
		} else p = 0;
		if ((c[Ra >> 2] | 0) == (c[f + 4636 >> 2] | 0)) R = (c[q >> 2] | 0) != (c[Va >> 2] | 0);
		else R = 1;
		c[f + 24544 >> 2] = c[g >> 2];
		c[q >> 2] = c[Va >> 2];
		o = j * 100 | 0;
		q = c[r >> 2] | 0;
		Q = (o | 0) / (q | 0) | 0;
		Ma = (Q | 0) > 1 ? Q >> 1 : 1;
		Oa = (m | 0) == 0;
		e: do
			if (Oa) {
				if ((_(Q, q) | 0) != (o | 0) | (j | 0) < 0) {
					fa = -101;
					i = Wa;
					return fa | 0
				}
				if ((j * 1e3 | 0) > (_(c[Ra >> 2] | 0, q) | 0)) {
					fa = -101;
					i = Wa;
					return fa | 0
				} else {
					q = c[Va >> 2] | 0;
					m = 0;
					r = 0;
					break
				}
			} else {
				if ((Q | 0) == 1) q = 0;
				else {
					fa = -101;
					i = Wa;
					return fa | 0
				}
				while (1) {
					o = c[Va >> 2] | 0;
					if ((q | 0) >= (o | 0)) break;
					p = Qb(f + (q * 12240 | 0) | 0, c[f + (q * 12240 | 0) + 5124 >> 2] | 0) | 0;
					q = q + 1 | 0
				}
				r = c[Ra >> 2] | 0;
				c[Ra >> 2] = 10;
				m = c[Qa >> 2] | 0;
				c[Qa >> 2] = 0;
				q = o;
				o = 0;
				while (1) {
					if ((o | 0) >= (q | 0)) break e;
					c[f + (o * 12240 | 0) + 4700 >> 2] = 0;
					c[f + (o * 12240 | 0) + 4712 >> 2] = 1;
					q = c[Va >> 2] | 0;
					o = o + 1 | 0
				}
			}
		while (0);
		Ia = g + 28 | 0;
		C = c[Ia >> 2] >> q + -1;
		La = f + 4600 | 0;
		Ja = f + 24560 | 0;
		D = g + 48 | 0;
		E = g + 8 | 0;
		F = g + 12 | 0;
		G = g + 16 | 0;
		H = g + 20 | 0;
		I = g + 40 | 0;
		J = g + 4 | 0;
		K = g + 24 | 0;
		L = g + 36 | 0;
		M = g + 32 | 0;
		N = g + 60 | 0;
		O = g + 84 | 0;
		P = g + 52 | 0;
		Ka = f + 5776 | 0;
		B = 0;
		while (1) {
			if ((B | 0) >= (q | 0)) break;
			if ((B | 0) == 1) x = c[La >> 2] | 0;
			else x = 0;
			y = f + (B * 12240 | 0) | 0;
			v = c[Ja >> 2] | 0;
			c[f + (B * 12240 | 0) + 6108 >> 2] = c[S >> 2];
			c[f + (B * 12240 | 0) + 4708 >> 2] = c[D >> 2];
			u = c[E >> 2] | 0;
			c[f + (B * 12240 | 0) + 4580 >> 2] = u;
			t = c[F >> 2] | 0;
			c[f + (B * 12240 | 0) + 4588 >> 2] = t;
			s = c[G >> 2] | 0;
			c[f + (B * 12240 | 0) + 4592 >> 2] = s;
			w = c[H >> 2] | 0;
			c[f + (B * 12240 | 0) + 4596 >> 2] = w;
			c[f + (B * 12240 | 0) + 6120 >> 2] = c[I >> 2];
			c[f + (B * 12240 | 0) + 5784 >> 2] = c[g >> 2];
			c[f + (B * 12240 | 0) + 5788 >> 2] = c[J >> 2];
			c[f + (B * 12240 | 0) + 4560 >> 2] = v;
			c[f + (B * 12240 | 0) + 5792 >> 2] = B;
			A = f + (B * 12240 | 0) + 4700 | 0;
			do
				if (!(c[A >> 2] | 0)) Na = 40;
				else {
					if (c[f + (B * 12240 | 0) + 4712 >> 2] | 0) {
						Na = 40;
						break
					}
					if ((u | 0) == (c[f + (B * 12240 | 0) + 4584 >> 2] | 0)) break;
					q = c[f + (B * 12240 | 0) + 4600 >> 2] | 0;
					if ((q | 0) <= 0) break;
					n = Rb(y, q) | 0;
					Na = 109
				}
			while (0);
			if ((Na | 0) == 40) {
				Na = 0;
				z = f + (B * 12240 | 0) + 4600 | 0;
				q = c[z >> 2] | 0;
				fa = q << 16 >> 16;
				o = fa * 1e3 | 0;
				do
					if (fa) {
						if ((o | 0) > (u | 0) | (o | 0) > (t | 0) | (o | 0) < (s | 0)) {
							q = (u | 0) < (t | 0) ? u : t;
							q = (((q | 0) > (s | 0) ? q : s) | 0) / 1e3 | 0;
							break
						}
						s = f + (B * 12240 | 0) + 24 | 0;
						p = c[s >> 2] | 0;
						if ((p | 0) > 255) c[f + (B * 12240 | 0) + 28 >> 2] = 0;
						if ((v | 0) == 0 ? (c[N >> 2] | 0) == 0 : 0) break;
						if ((o | 0) > (w | 0)) {
							t = f + (B * 12240 | 0) + 28 | 0;
							if (!(c[t >> 2] | 0)) {
								c[s >> 2] = 256;
								p = f + (B * 12240 | 0) + 16 | 0;
								c[p >> 2] = 0;
								c[p + 4 >> 2] = 0;
								p = 256
							}
							if (c[N >> 2] | 0) {
								c[t >> 2] = 0;
								q = (q | 0) == 16 ? 12 : 8;
								break
							}
							if ((p | 0) < 1) {
								c[O >> 2] = 1;
								fa = c[P >> 2] | 0;
								c[P >> 2] = fa - ((fa * 5 | 0) / ((c[K >> 2] | 0) + 5 | 0) | 0);
								break
							} else {
								c[t >> 2] = -2;
								break
							}
						}
						if ((o | 0) >= (w | 0)) {
							p = f + (B * 12240 | 0) + 28 | 0;
							if ((c[p >> 2] | 0) >= 0) break;
							c[p >> 2] = 1;
							break
						}
						if (c[N >> 2] | 0) {
							c[s >> 2] = 0;
							fa = f + (B * 12240 | 0) + 16 | 0;
							c[fa >> 2] = 0;
							c[fa + 4 >> 2] = 0;
							c[f + (B * 12240 | 0) + 28 >> 2] = 1;
							q = (q | 0) == 8 ? 12 : 16;
							break
						}
						p = f + (B * 12240 | 0) + 28 | 0;
						if (!(c[p >> 2] | 0)) {
							c[O >> 2] = 1;
							fa = c[P >> 2] | 0;
							c[P >> 2] = fa - ((fa * 5 | 0) / ((c[K >> 2] | 0) + 5 | 0) | 0);
							break
						} else {
							c[p >> 2] = 1;
							break
						}
					} else q = (((w | 0) < (u | 0) ? w : u) | 0) / 1e3 | 0;
				while (0);
				u = (x | 0) == 0 ? q : x;
				y = Rb(y, u) | 0;
				w = c[K >> 2] | 0;
				n = f + (B * 12240 | 0) + 4636 | 0;
				if ((c[n >> 2] | 0) == (w | 0)) {
					q = c[z >> 2] | 0;
					t = 0
				} else {
					t = (w | 0) == 10;
					f: do
						if (!t) {
							switch (w | 0) {
								case 60:
								case 40:
								case 20:
									{
										s = 0;
										break
									}
								default:
									if ((w | 0) < 11) {
										s = -103;
										Na = 69;
										break f
									} else s = -103
							}
							c[f + (B * 12240 | 0) + 5776 >> 2] = (w | 0) / 20 | 0;
							c[f + (B * 12240 | 0) + 4604 >> 2] = 4;
							q = u << 16 >> 16;
							c[f + (B * 12240 | 0) + 4608 >> 2] = q * 20;
							c[f + (B * 12240 | 0) + 4572 >> 2] = q * 24;
							q = c[z >> 2] | 0;
							t = f + (B * 12240 | 0) + 4720 | 0;
							if ((q | 0) == 8) {
								c[t >> 2] = 35136;
								q = 8;
								t = s;
								break
							} else {
								c[t >> 2] = 35102;
								t = s;
								break
							}
						} else {
							s = 0;
							Na = 69
						}
					while (0);
					do
						if ((Na | 0) == 69) {
							Na = 0;
							c[f + (B * 12240 | 0) + 5776 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4604 >> 2] = t ? 2 : 1;
							q = u << 16 >> 16;
							c[f + (B * 12240 | 0) + 4608 >> 2] = _(w << 16 >> 16, q) | 0;
							c[f + (B * 12240 | 0) + 4572 >> 2] = q * 14;
							q = c[z >> 2] | 0;
							t = f + (B * 12240 | 0) + 4720 | 0;
							if ((q | 0) == 8) {
								c[t >> 2] = 35159;
								q = 8;
								t = s;
								break
							} else {
								c[t >> 2] = 35147;
								t = s;
								break
							}
						}
					while (0);
					c[n >> 2] = w;
					c[f + (B * 12240 | 0) + 4632 >> 2] = 0
				}
				g: do
					if ((q | 0) != (u | 0)) {
						q = f + (B * 12240 | 0) + 7200 | 0;
						p = f + (B * 12240 | 0) + 16 | 0;
						c[p >> 2] = 0;
						c[p + 4 >> 2] = 0;
						c[f + (B * 12240 | 0) + 5772 >> 2] = 0;
						c[f + (B * 12240 | 0) + 5780 >> 2] = 0;
						c[f + (B * 12240 | 0) + 4632 >> 2] = 0;
						id(f + (B * 12240 | 0) + 144 | 0, 0, 4412) | 0;
						id(q | 0, 0, 2152) | 0;
						c[f + (B * 12240 | 0) + 4568 >> 2] = 100;
						c[f + (B * 12240 | 0) + 4696 >> 2] = 1;
						c[f + (B * 12240 | 0) + 9352 >> 2] = 100;
						a[q >> 0] = 10;
						c[f + (B * 12240 | 0) + 4500 >> 2] = 100;
						c[f + (B * 12240 | 0) + 4516 >> 2] = 65536;
						a[f + (B * 12240 | 0) + 4565 >> 0] = 0;
						c[z >> 2] = u;
						q = c[f + (B * 12240 | 0) + 4604 >> 2] | 0;
						p = (q | 0) == 4;
						o = f + (B * 12240 | 0) + 4720 | 0;
						do
							if ((u | 0) == 8)
								if (p) {
									c[o >> 2] = 35136;
									q = 4;
									Na = 85;
									break
								} else {
									c[o >> 2] = 35159;
									Na = 85;
									break
								}
						else {
							if (p) {
								c[o >> 2] = 35102;
								q = 4
							} else c[o >> 2] = 35147;
							if ((u | 0) == 12) {
								Na = 85;
								break
							}
							c[f + (B * 12240 | 0) + 4664 >> 2] = 16;
							c[f + (B * 12240 | 0) + 4724 >> 2] = 23148
						} while (0);
						if ((Na | 0) == 85) {
							c[f + (B * 12240 | 0) + 4664 >> 2] = 10;
							c[f + (B * 12240 | 0) + 4724 >> 2] = 23112
						}
						c[f + (B * 12240 | 0) + 4612 >> 2] = u * 5;
						c[f + (B * 12240 | 0) + 4608 >> 2] = _(u * 327680 >> 16, q << 16 >> 16) | 0;
						ea = u << 16;
						fa = ea >> 16;
						c[f + (B * 12240 | 0) + 4616 >> 2] = fa * 20;
						c[f + (B * 12240 | 0) + 4620 >> 2] = ea >> 15;
						c[f + (B * 12240 | 0) + 4576 >> 2] = fa * 18;
						c[f + (B * 12240 | 0) + 4572 >> 2] = (q | 0) == 4 ? fa * 24 | 0 : fa * 14 | 0;
						switch (u | 0) {
							case 16:
								{
									c[f + (B * 12240 | 0) + 4684 >> 2] = 10;c[f + (B * 12240 | 0) + 4716 >> 2] = 35024;u = 16;
									break g
								}
							case 12:
								{
									c[f + (B * 12240 | 0) + 4684 >> 2] = 13;c[f + (B * 12240 | 0) + 4716 >> 2] = 35018;u = 12;
									break g
								}
							default:
								{
									c[f + (B * 12240 | 0) + 4684 >> 2] = 15;c[f + (B * 12240 | 0) + 4716 >> 2] = 35009;
									break g
								}
						}
					}
				while (0);
				n = y + t | 0;
				s = c[L >> 2] | 0;
				do
					if ((s | 0) >= 2) {
						if ((s | 0) < 4) {
							c[f + (B * 12240 | 0) + 4668 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4676 >> 2] = 49807;
							q = f + (B * 12240 | 0) + 4672 | 0;
							c[q >> 2] = 8;
							c[f + (B * 12240 | 0) + 4660 >> 2] = 10;
							o = u * 5 | 0;
							c[f + (B * 12240 | 0) + 4624 >> 2] = o;
							c[f + (B * 12240 | 0) + 4652 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4656 >> 2] = 0;
							c[f + (B * 12240 | 0) + 4680 >> 2] = 0;
							c[f + (B * 12240 | 0) + 4692 >> 2] = 4;
							c[f + (B * 12240 | 0) + 4704 >> 2] = 0;
							p = 8;
							break
						}
						if ((s | 0) < 6) {
							c[f + (B * 12240 | 0) + 4668 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4676 >> 2] = 48497;
							q = f + (B * 12240 | 0) + 4672 | 0;
							c[q >> 2] = 10;
							c[f + (B * 12240 | 0) + 4660 >> 2] = 12;
							o = u * 5 | 0;
							c[f + (B * 12240 | 0) + 4624 >> 2] = o;
							c[f + (B * 12240 | 0) + 4652 >> 2] = 2;
							c[f + (B * 12240 | 0) + 4656 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4680 >> 2] = 0;
							c[f + (B * 12240 | 0) + 4692 >> 2] = 8;
							c[f + (B * 12240 | 0) + 4704 >> 2] = u * 983;
							p = 10;
							break
						}
						q = f + (B * 12240 | 0) + 4668 | 0;
						if ((s | 0) < 8) {
							c[q >> 2] = 1;
							c[f + (B * 12240 | 0) + 4676 >> 2] = 47186;
							q = f + (B * 12240 | 0) + 4672 | 0;
							c[q >> 2] = 12;
							c[f + (B * 12240 | 0) + 4660 >> 2] = 14;
							o = u * 5 | 0;
							c[f + (B * 12240 | 0) + 4624 >> 2] = o;
							c[f + (B * 12240 | 0) + 4652 >> 2] = 3;
							c[f + (B * 12240 | 0) + 4656 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4680 >> 2] = 0;
							c[f + (B * 12240 | 0) + 4692 >> 2] = 16;
							c[f + (B * 12240 | 0) + 4704 >> 2] = u * 983;
							p = 12;
							break
						} else {
							c[q >> 2] = 2;
							c[f + (B * 12240 | 0) + 4676 >> 2] = 45875;
							q = f + (B * 12240 | 0) + 4672 | 0;
							c[q >> 2] = 16;
							c[f + (B * 12240 | 0) + 4660 >> 2] = 16;
							o = u * 5 | 0;
							c[f + (B * 12240 | 0) + 4624 >> 2] = o;
							c[f + (B * 12240 | 0) + 4652 >> 2] = 4;
							c[f + (B * 12240 | 0) + 4656 >> 2] = 1;
							c[f + (B * 12240 | 0) + 4680 >> 2] = 0;
							c[f + (B * 12240 | 0) + 4692 >> 2] = 32;
							c[f + (B * 12240 | 0) + 4704 >> 2] = u * 983;
							p = 16;
							break
						}
					} else {
						c[f + (B * 12240 | 0) + 4668 >> 2] = 0;
						c[f + (B * 12240 | 0) + 4676 >> 2] = 52429;
						q = f + (B * 12240 | 0) + 4672 | 0;
						c[q >> 2] = 6;
						c[f + (B * 12240 | 0) + 4660 >> 2] = 8;
						o = u * 3 | 0;
						c[f + (B * 12240 | 0) + 4624 >> 2] = o;
						c[f + (B * 12240 | 0) + 4652 >> 2] = 1;
						c[f + (B * 12240 | 0) + 4656 >> 2] = 0;
						c[f + (B * 12240 | 0) + 4680 >> 2] = 1;
						c[f + (B * 12240 | 0) + 4692 >> 2] = 2;
						c[f + (B * 12240 | 0) + 4704 >> 2] = 0;
						p = 6
					}
				while (0);
				fa = c[f + (B * 12240 | 0) + 4664 >> 2] | 0;
				c[q >> 2] = (p | 0) < (fa | 0) ? p : fa;
				c[f + (B * 12240 | 0) + 4628 >> 2] = (u * 5 | 0) + (o << 1);
				c[f + (B * 12240 | 0) + 4648 >> 2] = s;
				s = c[M >> 2] | 0;
				c[f + (B * 12240 | 0) + 4640 >> 2] = s;
				fa = f + (B * 12240 | 0) + 6124 | 0;
				t = c[fa >> 2] | 0;
				c[fa >> 2] = 0;
				do
					if ((s | 0) > 0 ? (c[f + (B * 12240 | 0) + 6120 >> 2] | 0) != 0 : 0) {
						o = (u | 0) == 8 ? 12e3 : (u | 0) == 12 ? 14e3 : 16e3;
						if ((s | 0) < 25) {
							q = s;
							p = s
						} else {
							q = 25;
							p = 25
						}
						if ((C | 0) <= ((((_(o, 125 - q | 0) | 0) >> 16) * 655 | 0) + ((((_(o, 125 - p | 0) | 0) & 65520) * 655 | 0) >>> 16) | 0)) break;
						if (!t) c[f + (B * 12240 | 0) + 6128 >> 2] = 7;
						else {
							fa = 7 - (((s >> 16) * 26214 | 0) + (((s & 65535) * 26214 | 0) >>> 16)) | 0;
							c[f + (B * 12240 | 0) + 6128 >> 2] = (fa | 0) > 2 ? fa : 2
						}
						c[f + (B * 12240 | 0) + 6124 >> 2] = 1
					}
				while (0);
				c[A >> 2] = 1;
				Na = 109
			}
			if ((Na | 0) == 109 ? (Na = 0, (n | 0) != 0) : 0) {
				Na = 250;
				break
			}
			h: do
				if ((c[f + (B * 12240 | 0) + 4696 >> 2] | 0) == 0 ^ 1 | R) {
					q = 0;
					while (1) {
						if ((q | 0) >= (c[Ka >> 2] | 0)) break h;
						c[f + (B * 12240 | 0) + 4756 + (q << 2) >> 2] = 0;
						q = q + 1 | 0
					}
				}
			while (0);
			c[f + (B * 12240 | 0) + 6112 >> 2] = c[f + (B * 12240 | 0) + 6108 >> 2];
			q = c[Va >> 2] | 0;
			p = 0;
			B = B + 1 | 0
		}
		if ((Na | 0) == 250) {
			i = Wa;
			return n | 0
		}
		J = Q * 10 | 0;
		t = c[La >> 2] | 0;
		I = _(J, t) | 0;
		v = f + 4580 | 0;
		t = (_(I, c[v >> 2] | 0) | 0) / (t * 1e3 | 0) | 0;
		Ha = na() | 0;
		u = i;
		i = i + ((1 * (t << 1) | 0) + 15 & -16) | 0;
		t = f + 4608 | 0;
		s = f + 5772 | 0;
		Fa = f + 24552 | 0;
		B = f + 18048 | 0;
		C = f + 5808 | 0;
		D = f + 16848 | 0;
		E = f + 18012 | 0;
		F = f + 16840 | 0;
		G = k + 20 | 0;
		H = k + 28 | 0;
		T = f + 24536 | 0;
		U = f + 4565 | 0;
		V = f + 4600 | 0;
		W = f + 4568 | 0;
		X = f + 4728 | 0;
		Y = f + 8 | 0;
		Z = f + 4556 | 0;
		$ = f + 24540 | 0;
		ba = f + 24480 | 0;
		ca = f + 5132 | 0;
		da = f + 17372 | 0;
		ea = f + 4556 | 0;
		Ga = g + 56 | 0;
		fa = f + 24564 | 0;
		ga = f + 19440 | 0;
		ha = f + 12384 | 0;
		ia = f + 12256 | 0;
		ja = f + 16808 | 0;
		ka = f + 16740 | 0;
		la = f + 16805 | 0;
		ma = f + 16756 | 0;
		oa = f + 16936 | 0;
		pa = f + 12240 | 0;
		qa = g + 52 | 0;
		ra = (Ma | 0) == 2;
		sa = Ta + 4 | 0;
		ta = Ma << 1;
		ua = Ma + -1 | 0;
		va = k + 24 | 0;
		wa = k + 40 | 0;
		xa = k + 44 | 0;
		za = k + 32 | 0;
		Aa = f + 6112 | 0;
		Ba = f + 24556 | 0;
		Ca = f + 18352 | 0;
		Da = f + 5128 | 0;
		Ea = f + 24484 | 0;
		w = h;
		L = j;
		K = 0;
		while (1) {
			x = (c[t >> 2] | 0) - (c[s >> 2] | 0) | 0;
			x = (x | 0) < (I | 0) ? x : I;
			Q = _(x, c[v >> 2] | 0) | 0;
			Q = (Q | 0) / ((c[La >> 2] | 0) * 1e3 | 0) | 0;
			do
				if ((c[g >> 2] | 0) == 2)
					if ((c[Va >> 2] | 0) == 2) {
						z = c[Sa >> 2] | 0;
						y = 0;
						while (1) {
							if ((y | 0) >= (Q | 0)) break;
							b[u + (y << 1) >> 1] = b[w + (y << 1 << 1) >> 1] | 0;
							y = y + 1 | 0
						}
						if ((c[Fa >> 2] | 0) == 1 & (z | 0) == 0) nd(B | 0, C | 0, 300) | 0;
						cc(C, f + 5128 + ((c[s >> 2] | 0) + 2 << 1) | 0, u, Q);
						c[s >> 2] = (c[s >> 2] | 0) + x;
						y = (c[D >> 2] | 0) - (c[E >> 2] | 0) | 0;
						z = _(J, c[F >> 2] | 0) | 0;
						z = (y | 0) < (z | 0) ? y : z;
						y = 0;
						while (1) {
							if ((y | 0) >= (Q | 0)) break;
							b[u + (y << 1) >> 1] = b[w + ((y << 1 | 1) << 1) >> 1] | 0;
							y = y + 1 | 0
						}
						cc(B, f + 17368 + ((c[E >> 2] | 0) + 2 << 1) | 0, u, Q);
						c[E >> 2] = (c[E >> 2] | 0) + z;
						z = c[s >> 2] | 0;
						break
					} else {
						if ((c[Va >> 2] | 0) == 1) z = 0;
						else {
							Na = 135;
							break
						}
						while (1) {
							if ((z | 0) >= (Q | 0)) break;
							S = z << 1;
							S = (b[w + (S << 1) >> 1] | 0) + (b[w + ((S | 1) << 1) >> 1] | 0) | 0;
							b[u + (z << 1) >> 1] = (S >>> 1) + (S & 1);
							z = z + 1 | 0
						}
						cc(C, f + 5128 + ((c[s >> 2] | 0) + 2 << 1) | 0, u, Q);
						i: do
							if ((c[Fa >> 2] | 0) == 2) {
								if (c[Sa >> 2] | 0) break;
								cc(B, f + 17368 + ((c[E >> 2] | 0) + 2 << 1) | 0, u, Q);
								z = 0;
								while (1) {
									if ((z | 0) >= (c[t >> 2] | 0)) break i;
									S = f + 5128 + ((c[s >> 2] | 0) + z + 2 << 1) | 0;
									b[S >> 1] = ((b[S >> 1] | 0) + (b[f + 17368 + ((c[E >> 2] | 0) + z + 2 << 1) >> 1] | 0) | 0) >>> 1;
									z = z + 1 | 0
								}
							}
						while (0);
						z = (c[s >> 2] | 0) + x | 0;
						c[s >> 2] = z;
						break
					}
			else Na = 135; while (0);
			if ((Na | 0) == 135) {
				Na = 0;
				nd(u | 0, w | 0, Q << 1 | 0) | 0;
				cc(C, f + 5128 + ((c[s >> 2] | 0) + 2 << 1) | 0, u, Q);
				z = (c[s >> 2] | 0) + x | 0;
				c[s >> 2] = z
			}
			S = w + ((_(Q, c[g >> 2] | 0) | 0) << 1) | 0;
			R = L - Q | 0;
			c[Ja >> 2] = 0;
			if ((z | 0) < (c[t >> 2] | 0)) {
				q = 0;
				break
			}
			if (!((c[Sa >> 2] | 0) == 0 ^ 1 | Oa ^ 1)) {
				b[Ua >> 1] = 0;
				a[Ua >> 0] = 256 - (256 >>> (_((c[Ka >> 2] | 0) + 1 | 0, c[Va >> 2] | 0) | 0));
				hb(k, 0, Ua, 8);
				w = 0;
				while (1) {
					z = c[Va >> 2] | 0;
					if ((w | 0) >= (z | 0)) {
						q = 0;
						break
					}
					z = c[f + (w * 12240 | 0) + 5776 >> 2] | 0;
					y = 0;
					x = 0;
					while (1) {
						if ((x | 0) >= (z | 0)) break;
						y = y | c[f + (w * 12240 | 0) + 4756 + (x << 2) >> 2] << x;
						x = x + 1 | 0
					}
					a[f + (w * 12240 | 0) + 4755 >> 0] = (y | 0) > 0 & 1;
					if ((y | 0) != 0 & (z | 0) > 1) hb(k, y + -1 | 0, c[23280 + (z + -2 << 2) >> 2] | 0, 8);
					w = w + 1 | 0
				}
				while (1) {
					if ((q | 0) >= (c[Ka >> 2] | 0)) {
						y = 0;
						break
					}
					x = f + 24514 + (q * 6 | 0) | 0;
					w = f + 16996 + (q << 2) | 0;
					n = f + 24532 + q | 0;
					o = q + -1 | 0;
					y = 0;
					while (1) {
						if ((y | 0) >= (z | 0)) break;
						if (c[f + (y * 12240 | 0) + 4756 + (q << 2) >> 2] | 0) {
							do
								if ((z | 0) == 2 & (y | 0) == 0) {
									kc(k, x);
									if (c[w >> 2] | 0) break;
									hb(k, a[n >> 0] | 0, 34990, 8)
								}
							while (0);
							if ((q | 0) > 0 ? (c[f + (y * 12240 | 0) + 4756 + (o << 2) >> 2] | 0) != 0 : 0) z = 2;
							else z = 0;
							Eb(f + (y * 12240 | 0) | 0, k, q, 1, z);
							Fb(k, a[f + (y * 12240 | 0) + 6132 + (q * 36 | 0) + 29 >> 0] | 0, a[f + (y * 12240 | 0) + 6132 + (q * 36 | 0) + 30 >> 0] | 0, f + (y * 12240 | 0) + 6240 + (q * 320 | 0) | 0, c[f + (y * 12240 | 0) + 4608 >> 2] | 0);
							z = c[Va >> 2] | 0
						}
						y = y + 1 | 0
					}
					q = q + 1 | 0
				}
				while (1) {
					if ((y | 0) >= (z | 0)) break;
					z = f + (y * 12240 | 0) + 4756 | 0;
					c[z >> 2] = 0;
					c[z + 4 >> 2] = 0;
					c[z + 8 >> 2] = 0;
					z = c[Va >> 2] | 0;
					y = y + 1 | 0
				}
				c[T >> 2] = (c[G >> 2] | 0) + ((aa(c[H >> 2] | 0) | 0) + -32)
			}
			if ((a[U >> 0] | 0) == 2) {
				P = _(c[V >> 2] | 0, 65536e3) | 0;
				P = (Wb((P | 0) / (c[W >> 2] | 0) | 0) | 0) + -2048 | 0;
				x = c[X >> 2] | 0;
				z = 0 - x << 2;
				x = x << 16 >> 16;
				O = _(z >> 16, x) | 0;
				x = _(z & 65532, x) | 0;
				z = P - ((Wb(3932160) | 0) + 63488) << 16 >> 16;
				z = P + ((_(O + (x >> 16) >> 16, z) | 0) + ((_(O + (x >>> 16) & 65535, z) | 0) >> 16)) | 0;
				x = c[Y >> 2] | 0;
				z = z - (x >> 8) | 0;
				O = (z | 0) < 0;
				P = z * 3 | 0;
				y = O ? P : z;
				y = _(c[Z >> 2] << 16 >> 16, (((O ? P : z) | 0) > 51 ? 51 : (y | 0) < -51 ? -51 : y) << 16 >> 16) | 0;
				y = x + (((y >> 16) * 6554 | 0) + (((y & 65535) * 6554 | 0) >>> 16)) | 0;
				c[Y >> 2] = y;
				x = (Wb(60) | 0) << 8;
				z = (Wb(100) | 0) << 8;
				do
					if ((x | 0) > (z | 0)) {
						if ((y | 0) > (x | 0)) {
							z = x;
							break
						}
						z = (y | 0) < (z | 0) ? z : y
					} else {
						if ((y | 0) > (z | 0)) break;
						z = (y | 0) < (x | 0) ? x : y
					}
				while (0);
				c[Y >> 2] = z
			}
			w = c[Ia >> 2] | 0;
			y = c[Ra >> 2] | 0;
			z = (_(w, y) | 0) / 1e3 | 0;
			if (Oa) z = z - (c[T >> 2] | 0) | 0;
			x = (z | 0) / (c[Ka >> 2] | 0) | 0;
			z = x << 16 >> 16;
			z = ((y | 0) == 10 ? z * 100 | 0 : z * 50 | 0) - (c[$ >> 2] << 1) | 0;
			do
				if (Oa) {
					y = c[Sa >> 2] | 0;
					if ((y | 0) <= 0) break;
					P = (c[G >> 2] | 0) + ((aa(c[H >> 2] | 0) | 0) + -32) | 0;
					z = z - (P - (c[T >> 2] | 0) - (_(x, y) | 0) << 1) | 0
				}
			while (0);
			do
				if ((w | 0) > 5e3) {
					if ((z | 0) > (w | 0)) break;
					w = (z | 0) < 5e3 ? 5e3 : z
				} else {
					if ((z | 0) > 5e3) {
						w = 5e3;
						break
					}
					w = (z | 0) < (w | 0) ? w : z
				}
			while (0);
			do
				if ((c[Va >> 2] | 0) == 2) {
					z = c[Sa >> 2] | 0;
					Ob(ba, ca, da, f + 24514 + (z * 6 | 0) | 0, f + 24532 + z | 0, Ta, w, c[ea >> 2] | 0, c[Ga >> 2] | 0, c[La >> 2] | 0, c[t >> 2] | 0);
					z = c[Sa >> 2] | 0;
					if (!(a[f + 24532 + z >> 0] | 0)) {
						if ((c[fa >> 2] | 0) == 1) {
							P = ia;
							c[P >> 2] = 0;
							c[P + 4 >> 2] = 0;
							id(ha | 0, 0, 4412) | 0;
							id(ga | 0, 0, 2156) | 0;
							c[ja >> 2] = 100;
							c[ka >> 2] = 100;
							a[ga >> 0] = 10;
							a[la >> 0] = 0;
							c[ma >> 2] = 65536;
							c[oa >> 2] = 1
						}
						qc(pa)
					} else a[f + 16992 + z >> 0] = 0;
					if (!Oa) break;
					kc(k, f + 24514 + ((c[Sa >> 2] | 0) * 6 | 0) | 0);
					z = c[Sa >> 2] | 0;
					if (a[f + 16992 + z >> 0] | 0) break;
					hb(k, a[f + 24532 + z >> 0] | 0, 34990, 8)
				} else {
					P = e[Ea >> 1] | e[Ea + 2 >> 1] << 16;
					b[Da >> 1] = P;
					b[Da + 2 >> 1] = P >>> 16;
					P = f + 5128 + (c[t >> 2] << 1) | 0;
					P = e[P >> 1] | e[P + 2 >> 1] << 16;
					b[Ea >> 1] = P;
					b[Ea + 2 >> 1] = P >>> 16
				}
			while (0);
			qc(f);
			O = (K | 0) == 0;
			N = (K | 0) == (ua | 0);
			M = (K | 0) == 1;
			P = 0;
			while (1) {
				z = c[Va >> 2] | 0;
				if ((P | 0) >= (z | 0)) break;
				y = c[qa >> 2] | 0;
				do
					if (ra) {
						if (!O) {
							x = y;
							break
						}
						x = (y * 3 | 0) / 5 | 0
					} else {
						if ((Ma | 0) != 3) {
							x = y;
							break
						}
						if (O) {
							x = (y << 1 | 0) / 5 | 0;
							break
						}
						if (!M) {
							x = y;
							break
						}
						x = (y * 3 | 0) / 4 | 0
					}
				while (0);
				n = ((c[Pa >> 2] | 0) == 0 ? 0 : N) & 1;
				do
					if ((z | 0) == 1) {
						z = w;
						o = x;
						A = n
					} else {
						z = c[Ta + (P << 2) >> 2] | 0;
						if (!((P | 0) == 0 & (c[sa >> 2] | 0) > 0)) {
							o = x;
							A = n;
							break
						}
						o = x - ((y | 0) / (ta | 0) | 0) | 0;
						A = 0
					}
				while (0);
				if ((z | 0) > 0) {
					y = (z | 0) > 8e4 ? 8e4 : (z | 0) < 5e3 ? 5e3 : z;
					z = f + (P * 12240 | 0) + 4632 | 0;
					j: do
						if ((y | 0) != (c[z >> 2] | 0)) {
							c[z >> 2] = y;
							n = c[f + (P * 12240 | 0) + 4600 >> 2] | 0;
							n = (n | 0) == 8 ? 23184 : (n | 0) == 12 ? 23216 : 23248;
							z = (c[f + (P * 12240 | 0) + 4604 >> 2] | 0) == 2 ? y + -2200 | 0 : y;
							x = 1;
							while (1) {
								if ((x | 0) >= 8) break j;
								y = c[n + (x << 2) >> 2] | 0;
								if ((z | 0) <= (y | 0)) break;
								x = x + 1 | 0
							}
							q = x + -1 | 0;
							p = c[n + (q << 2) >> 2] | 0;
							q = b[30696 + (q << 1) >> 1] | 0;
							c[f + (P * 12240 | 0) + 4748 >> 2] = (q << 6) + (_((z - p << 6 | 0) / (y - p | 0) | 0, (b[30696 + (x << 1) >> 1] | 0) - q | 0) | 0)
						}
					while (0);
					do
						if ((c[Sa >> 2] | 0) > (P | 0)) {
							if ((P | 0) > 0 ? (c[fa >> 2] | 0) != 0 : 0) {
								z = 1;
								break
							}
							z = 2
						} else z = 0;
					while (0);
					p = rc(f + (P * 12240 | 0) | 0, l, k, z, o, A) | 0
				}
				c[f + (P * 12240 | 0) + 4700 >> 2] = 0;
				c[f + (P * 12240 | 0) + 5772 >> 2] = 0;
				q = f + (P * 12240 | 0) + 5780 | 0;
				c[q >> 2] = (c[q >> 2] | 0) + 1;
				P = P + 1 | 0
			}
			x = c[Sa >> 2] | 0;
			c[fa >> 2] = a[x + -1 + (f + 24532) >> 0];
			do
				if ((c[l >> 2] | 0) > 0) {
					if ((x | 0) != (c[Ka >> 2] | 0)) break;
					w = c[Va >> 2] | 0;
					q = 0;
					o = 0;
					while (1) {
						if ((o | 0) >= (w | 0)) break;
						n = c[f + (o * 12240 | 0) + 5776 >> 2] | 0;
						z = q;
						y = 0;
						while (1) {
							z = z << 1;
							if ((y | 0) >= (n | 0)) break;
							z = z | a[f + (o * 12240 | 0) + 4752 + y >> 0];
							y = y + 1 | 0
						}
						q = z | a[f + (o * 12240 | 0) + 4755 >> 0];
						o = o + 1 | 0
					}
					do
						if (Oa) {
							z = _(x + 1 | 0, w) | 0;
							y = 8 - z | 0;
							x = (1 << z) + -1 << y;
							if (c[va >> 2] | 0) {
								P = c[k >> 2] | 0;
								a[P >> 0] = d[P >> 0] & (x ^ 255) | q << y;
								break
							}
							w = c[wa >> 2] | 0;
							if ((w | 0) > -1) {
								c[wa >> 2] = w & ~x | q << y;
								break
							}
							if ((c[H >> 2] | 0) >>> 0 > -2147483648 >>> z >>> 0) {
								c[xa >> 2] = -1;
								break
							} else {
								c[za >> 2] = c[za >> 2] & ~(x << 23) | q << y + 23;
								break
							}
						}
					while (0);
					do
						if (c[Aa >> 2] | 0) {
							if ((c[Va >> 2] | 0) != 1 ? (c[Ca >> 2] | 0) == 0 : 0) break;
							c[l >> 2] = 0
						}
					while (0);
					z = (c[$ >> 2] | 0) + (c[l >> 2] << 3) | 0;
					c[$ >> 2] = z;
					z = z - ((_(c[Ia >> 2] | 0, c[Ra >> 2] | 0) | 0) / 1e3 | 0) | 0;
					c[$ >> 2] = z;
					c[$ >> 2] = (z | 0) > 1e4 ? 1e4 : (z | 0) < 0 ? 0 : z;
					z = c[Ba >> 2] | 0;
					if ((c[ea >> 2] | 0) < (((z << 16 >> 16) * 3188 >> 16) + 13 | 0)) {
						c[Ja >> 2] = 1;
						c[Ba >> 2] = 0;
						break
					} else {
						c[Ja >> 2] = 0;
						c[Ba >> 2] = z + (c[Ra >> 2] | 0);
						break
					}
				}
			while (0);
			if ((L | 0) == (Q | 0)) {
				Na = 239;
				break
			}
			w = S;
			L = R;
			K = K + 1 | 0
		}
		if ((Na | 0) == 239) q = c[Ja >> 2] | 0;
		c[Fa >> 2] = c[Va >> 2];
		c[g + 72 >> 2] = q;
		if ((c[La >> 2] | 0) == 16) n = (c[f + 28 >> 2] | 0) == 0;
		else n = 0;
		c[g + 76 >> 2] = n & 1;
		c[g + 68 >> 2] = (c[La >> 2] << 16 >> 16) * 1e3;
		if (!(c[Ga >> 2] | 0)) n = b[f + 24508 >> 1] | 0;
		else n = 0;
		c[g + 80 >> 2] = n;
		k: do
			if (!Oa) {
				c[Ra >> 2] = r;
				c[Qa >> 2] = m;
				n = 0;
				while (1) {
					if ((n | 0) >= (c[Va >> 2] | 0)) break k;
					c[f + (n * 12240 | 0) + 4700 >> 2] = 0;
					c[f + (n * 12240 | 0) + 4712 >> 2] = 0;
					n = n + 1 | 0
				}
			}
		while (0);
		ya(Ha | 0);
		fa = p;
		i = Wa;
		return fa | 0
	}

	function rc(f, j, l, m, n, o) {
		f = f | 0;
		j = j | 0;
		l = l | 0;
		m = m | 0;
		n = n | 0;
		o = o | 0;
		var p = 0,
			q = 0,
			r = 0.0,
			s = 0,
			t = 0,
			u = 0,
			v = 0,
			w = 0,
			x = 0,
			y = 0,
			z = 0.0,
			A = 0,
			B = 0.0,
			C = 0.0,
			D = 0.0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0,
			J = 0,
			K = 0.0,
			L = 0.0,
			M = 0.0,
			P = 0.0,
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
			na = 0,
			oa = 0,
			pa = 0,
			qa = 0,
			ra = 0,
			sa = 0,
			ta = 0,
			ua = 0,
			va = 0,
			wa = 0.0,
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
			Ka = 0,
			La = 0,
			Ma = 0,
			Na = 0,
			Oa = 0,
			Pa = 0,
			Qa = 0,
			Ra = 0,
			Sa = 0,
			Ta = 0,
			Ua = 0,
			Va = 0,
			Wa = 0,
			Xa = 0,
			Ya = 0,
			Za = 0,
			_a = 0,
			$a = 0,
			ab = 0,
			bb = 0,
			cb = 0,
			db = 0,
			eb = 0,
			fb = 0,
			gb = 0,
			hb = 0,
			ib = 0,
			jb = 0,
			kb = 0,
			lb = 0.0,
			mb = 0.0,
			nb = 0,
			pb = 0,
			qb = 0,
			rb = 0,
			sb = 0.0;
		kb = i;
		i = i + 36224 | 0;
		Va = kb + 1096 | 0;
		Ua = kb + 72 | 0;
		Pa = kb + 32696 | 0;
		Ta = kb + 32056 | 0;
		Ka = kb + 31416 | 0;
		Ha = kb + 31096 | 0;
		ja = kb + 48 | 0;
		$ = kb + 27800 | 0;
		Fa = kb + 26256 | 0;
		Ia = kb + 23168 | 0;
		La = kb + 23024 | 0;
		ia = kb + 22720 | 0;
		Ra = kb + 2e4 | 0;
		Qa = kb + 12896 | 0;
		Na = kb + 7216 | 0;
		Q = kb + 33976 | 0;
		ya = kb + 7144 | 0;
		Ma = kb + 7080 | 0;
		ha = kb + 7016 | 0;
		Oa = kb + 5480 | 0;
		cb = kb + 30184 | 0;
		ib = kb + 26520 | 0;
		Z = kb + 23568 | 0;
		fb = kb + 23120 | 0;
		gb = kb + 24 | 0;
		hb = kb;
		db = kb + 15616 | 0;
		eb = kb + 8512 | 0;
		bb = kb + 8496 | 0;
		ab = kb + 34936 | 0;
		_a = f + 4644 | 0;
		$a = c[_a >> 2] | 0;
		c[_a >> 2] = $a + 1;
		_a = f + 4802 | 0;
		a[_a >> 0] = $a & 3;
		$a = f + 4616 | 0;
		Ja = c[$a >> 2] | 0;
		Sa = f + 9356 + (Ja << 2) | 0;
		Y = Z + (Ja << 2) | 0;
		Za = f + 4608 | 0;
		p = c[Za >> 2] | 0;
		a: do
			if (c[f + 28 >> 2] | 0) {
				w = f + 24 | 0;
				x = 256 - (c[w >> 2] | 0) << 10;
				v = x >> 16;
				x = x - (v << 16) | 0;
				b: do
					if ((v | 0) < 4) {
						if ((x | 0) <= 0) {
							la = 23288 + (v * 12 | 0) | 0;
							c[Va >> 2] = c[la >> 2];
							c[Va + 4 >> 2] = c[la + 4 >> 2];
							c[Va + 8 >> 2] = c[la + 8 >> 2];
							la = 23348 + (v << 3) | 0;
							ma = c[la + 4 >> 2] | 0;
							pa = Ua;
							c[pa >> 2] = c[la >> 2];
							c[pa + 4 >> 2] = ma;
							break
						}
						u = v + 1 | 0;
						t = x << 16 >> 16;
						if ((x | 0) < 32768) {
							y = 0;
							while (1) {
								if ((y | 0) == 3) {
									y = 0;
									break
								}
								ma = c[23288 + (v * 12 | 0) + (y << 2) >> 2] | 0;
								pa = (c[23288 + (u * 12 | 0) + (y << 2) >> 2] | 0) - ma | 0;
								c[Va + (y << 2) >> 2] = ma + ((_(pa >> 16, t) | 0) + ((_(pa & 65535, t) | 0) >> 16));
								y = y + 1 | 0
							}
							while (1) {
								if ((y | 0) == 2) break b;
								ma = c[23348 + (v << 3) + (y << 2) >> 2] | 0;
								pa = (c[23348 + (u << 3) + (y << 2) >> 2] | 0) - ma | 0;
								c[Ua + (y << 2) >> 2] = ma + ((_(pa >> 16, t) | 0) + ((_(pa & 65535, t) | 0) >> 16));
								y = y + 1 | 0
							}
						} else {
							y = 0;
							while (1) {
								if ((y | 0) == 3) {
									y = 0;
									break
								}
								ma = c[23288 + (u * 12 | 0) + (y << 2) >> 2] | 0;
								pa = ma - (c[23288 + (v * 12 | 0) + (y << 2) >> 2] | 0) | 0;
								c[Va + (y << 2) >> 2] = ma + ((_(pa >> 16, t) | 0) + ((_(pa & 65535, t) | 0) >> 16));
								y = y + 1 | 0
							}
							while (1) {
								if ((y | 0) == 2) break b;
								ma = c[23348 + (u << 3) + (y << 2) >> 2] | 0;
								pa = ma - (c[23348 + (v << 3) + (y << 2) >> 2] | 0) | 0;
								c[Ua + (y << 2) >> 2] = ma + ((_(pa >> 16, t) | 0) + ((_(pa & 65535, t) | 0) >> 16));
								y = y + 1 | 0
							}
						}
					} else {
						c[Va >> 2] = c[5834];
						c[Va + 4 >> 2] = c[5835];
						c[Va + 8 >> 2] = c[5836];
						pa = Ua;
						c[pa >> 2] = 35497197;
						c[pa + 4 >> 2] = 57401098
					}
				while (0);
				y = (c[w >> 2] | 0) + (c[f + 28 >> 2] | 0) | 0;
				c[w >> 2] = (y | 0) > 256 ? 256 : (y | 0) < 0 ? 0 : y;
				y = f + 16 | 0;
				w = 0 - (c[Ua >> 2] | 0) | 0;
				u = 0 - (c[Ua + 4 >> 2] | 0) | 0;
				x = f + 20 | 0;
				s = w & 16383;
				w = w >>> 14 << 16 >> 16;
				v = Va + 4 | 0;
				q = u & 16383;
				u = u >>> 14 << 16 >> 16;
				t = Va + 8 | 0;
				A = 0;
				while (1) {
					if ((A | 0) >= (p | 0)) break a;
					pa = f + 5128 + (A + 1 << 1) | 0;
					la = b[pa >> 1] | 0;
					ma = c[Va >> 2] | 0;
					ma = (c[y >> 2] | 0) + ((_(ma >> 16, la) | 0) + ((_(ma & 65535, la) | 0) >> 16)) << 2;
					ka = ma >> 16;
					ga = ma & 65532;
					ea = (c[x >> 2] | 0) + (((_(ka, s) | 0) + ((_(ga, s) | 0) >>> 16) >> 13) + 1 >> 1) + ((_(ka, w) | 0) + ((_(ga, w) | 0) >> 16)) | 0;
					c[y >> 2] = ea;
					fa = c[v >> 2] | 0;
					c[y >> 2] = ea + ((_(fa >> 16, la) | 0) + ((_(fa & 65535, la) | 0) >> 16));
					ga = (((_(ka, q) | 0) + ((_(ga, q) | 0) >>> 16) >> 13) + 1 >> 1) + ((_(ka, u) | 0) + ((_(ga, u) | 0) >> 16)) | 0;
					c[x >> 2] = ga;
					ka = c[t >> 2] | 0;
					c[x >> 2] = ga + ((_(ka >> 16, la) | 0) + ((_(ka & 65535, la) | 0) >> 16));
					ma = ma + 16383 >> 14;
					b[pa >> 1] = (ma | 0) > 32767 ? 32767 : (ma | 0) < -32768 ? -32768 : ma;
					A = A + 1 | 0
				}
			}
		while (0);
		Ya = f + 4600 | 0;
		x = Ja + ((c[Ya >> 2] | 0) * 5 | 0) | 0;
		v = c[Za >> 2] | 0;
		while (1) {
			w = v + -1 | 0;
			if ((v | 0) <= 0) {
				x = 0;
				break
			}
			g[f + 9356 + (x + w << 2) >> 2] = +(b[f + 5128 + (v << 1) >> 1] | 0);
			v = w
		}
		while (1) {
			if ((x | 0) == 8) break;
			pa = f + 9356 + (Ja + (((c[Ya >> 2] | 0) * 5 | 0) + (_(x, c[Za >> 2] >> 3) | 0)) << 2) | 0;
			g[pa >> 2] = +g[pa >> 2] + +(1 - (x & 2) | 0) * 9.999999974752427e-07;
			x = x + 1 | 0
		}
		Xa = f + 4712 | 0;
		c: do
			if (!(c[Xa >> 2] | 0)) {
				ra = c[f + 5124 >> 2] | 0;
				p = f + 4620 | 0;
				pa = c[p >> 2] | 0;
				w = pa + (c[Za >> 2] | 0) | 0;
				E = c[$a >> 2] | 0;
				F = w + E | 0;
				E = f + 9356 + (Ja - E << 2) | 0;
				x = f + 4572 | 0;
				w = Ja + (w - (c[x >> 2] | 0)) | 0;
				pc(Oa, f + 9356 + (w << 2) | 0, 1, pa);
				pa = c[p >> 2] | 0;
				w = w + pa | 0;
				nd(Oa + (pa << 2) | 0, f + 9356 + (w << 2) | 0, (c[x >> 2] | 0) - (pa << 1) << 2 | 0) | 0;
				p = c[p >> 2] | 0;
				y = (c[x >> 2] | 0) - (p << 1) | 0;
				pc(Oa + (pa + y << 2) | 0, f + 9356 + (w + y << 2) | 0, 2, p);
				x = c[x >> 2] | 0;
				p = f + 4672 | 0;
				y = c[p >> 2] | 0;
				y = (y | 0) < (x | 0) ? y + 1 | 0 : x;
				w = 0;
				while (1) {
					if ((w | 0) >= (y | 0)) break;
					g[ya + (w << 2) >> 2] = +xc(Oa, Oa + (w << 2) | 0, x - w | 0);
					w = w + 1 | 0
				}
				z = +g[ya >> 2];
				z = z + (z * 1.0000000474974513e-03 + 1.0);
				g[ya >> 2] = z;
				t = c[p >> 2] | 0;
				y = t + 1 | 0;
				x = 0;
				while (1) {
					if ((x | 0) >= (y | 0)) break;
					pa = c[ya + (x << 2) >> 2] | 0;
					c[Va + (x << 3) + 4 >> 2] = pa;
					c[Va + (x << 3) >> 2] = pa;
					x = x + 1 | 0
				}
				y = Va + 4 | 0;
				v = 0;
				d: while (1) {
					if ((t | 0) <= (v | 0)) break;
					x = v + 1 | 0;
					B = +g[y >> 2];
					B = - +g[Va + (x << 3) >> 2] / (B > 9.999999717180685e-10 ? B : 9.999999717180685e-10);
					g[ha + (v << 2) >> 2] = B;
					w = t - v | 0;
					u = 0;
					while (1) {
						if ((u | 0) >= (w | 0)) {
							v = x;
							continue d
						}
						ma = Va + (u + v + 1 << 3) | 0;
						r = +g[ma >> 2];
						pa = Va + (u << 3) + 4 | 0;
						C = +g[pa >> 2];
						g[ma >> 2] = r + C * B;
						g[pa >> 2] = C + r * B;
						u = u + 1 | 0
					}
				}
				r = +g[y >> 2];
				W = cb + 868 | 0;
				g[W >> 2] = z / (r > 1.0 ? r : 1.0);
				w = c[p >> 2] | 0;
				v = 0;
				while (1) {
					if ((v | 0) < (w | 0)) y = 0;
					else break;
					while (1) {
						if ((y | 0) == (v | 0)) break;
						c[Na + (y << 2) >> 2] = c[Ma + (y << 2) >> 2];
						y = y + 1 | 0
					}
					y = ha + (v << 2) | 0;
					x = 0;
					while (1) {
						if ((v | 0) == (x | 0)) break;
						pa = Ma + (x << 2) | 0;
						g[pa >> 2] = +g[pa >> 2] + +g[Na + (v - x + -1 << 2) >> 2] * +g[y >> 2];
						x = x + 1 | 0
					}
					g[Ma + (v << 2) >> 2] = - +g[y >> 2];
					v = v + 1 | 0
				}
				y = (c[p >> 2] | 0) + -1 | 0;
				z = .9900000095367432;
				x = 0;
				while (1) {
					if ((x | 0) >= (y | 0)) break;
					pa = Ma + (x << 2) | 0;
					g[pa >> 2] = +g[pa >> 2] * z;
					z = z * .9900000095367432;
					x = x + 1 | 0
				}
				Wa = Ma + (y << 2) | 0;
				g[Wa >> 2] = +g[Wa >> 2] * z;
				sc(Z, Ma, E, F, c[p >> 2] | 0);
				Wa = f + 4797 | 0;
				do
					if ((a[Wa >> 0] | 0) != 0 ? (c[f + 4696 >> 2] | 0) == 0 : 0) {
						wa = .6000000238418579 - +(c[p >> 2] | 0) * .004000000189989805 - +(c[f + 4556 >> 2] | 0) * .10000000149011612 * .00390625 - +(a[f + 4565 >> 0] >> 1 | 0) * .15000000596046448 - +(c[f + 4744 >> 2] | 0) * .10000000149011612 * .000030517578125;
						na = cb + 228 | 0;
						V = f + 4794 | 0;
						ua = f + 4796 | 0;
						oa = f + 12236 | 0;
						E = c[f + 4568 >> 2] | 0;
						L = +(c[f + 4676 >> 2] | 0) * .0000152587890625;
						qa = c[Ya >> 2] | 0;
						R = c[f + 4668 >> 2] | 0;
						U = c[f + 4604 >> 2] | 0;
						la = _((U * 5 | 0) + 20 | 0, qa) | 0;
						y = (U * 20 | 0) + 80 | 0;
						va = (U * 40 | 0) + 160 | 0;
						S = qa * 5 | 0;
						ta = qa << 1;
						sa = qa * 18 | 0;
						T = sa + -1 | 0;
						xa = (qa | 0) == 16;
						e: do
							if (xa) {
								x = la;
								while (1) {
									J = x + -1 | 0;
									if ((x | 0) <= 0) break;
									D = +g[Z + (J << 2) >> 2];
									G = (g[k >> 2] = D, c[k >> 2] | 0);
									p = (G & 2130706432) >>> 0 > 1249902592;
									if (!p) {
										F = (G | 0) < 0;
										B = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
										if (B == 0.0) B = F ? -0.0 : 0.0
									} else B = D;
									if ((~~B | 0) <= 32767) {
										if (!p) {
											F = (G | 0) < 0;
											B = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
											if (B == 0.0) B = F ? -0.0 : 0.0
										} else B = D;
										if ((~~B | 0) < -32768) x = -32768;
										else {
											if (!p) {
												F = (G | 0) < 0;
												D = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
												if (D == 0.0) D = F ? -0.0 : 0.0
											}
											x = ~~D
										}
									} else x = 32767;
									b[Na + (J << 1) >> 1] = x;
									x = J
								}
								w = ja;
								c[w >> 2] = 0;
								c[w + 4 >> 2] = 0;
								dc(ja, Ka, Na, la);
								w = va;
								while (1) {
									x = w + -1 | 0;
									if ((w | 0) <= 0) {
										x = ja;
										w = Ka;
										break e
									}
									g[Pa + (x << 2) >> 2] = +(b[Ka + (x << 1) >> 1] | 0);
									w = x
								}
							} else {
								if ((qa | 0) != 12) {
									x = va;
									while (1) {
										J = x + -1 | 0;
										if ((x | 0) <= 0) break;
										D = +g[Z + (J << 2) >> 2];
										p = (g[k >> 2] = D, c[k >> 2] | 0);
										A = (p & 2130706432) >>> 0 > 1249902592;
										if (!A) {
											F = (p | 0) < 0;
											B = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
											if (B == 0.0) B = F ? -0.0 : 0.0
										} else B = D;
										if ((~~B | 0) <= 32767) {
											if (!A) {
												F = (p | 0) < 0;
												B = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
												if (B == 0.0) B = F ? -0.0 : 0.0
											} else B = D;
											if ((~~B | 0) < -32768) x = -32768;
											else {
												if (!A) {
													x = (p | 0) < 0;
													D = x ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
													if (D == 0.0) D = x ? -0.0 : 0.0
												}
												x = ~~D
											}
										} else x = 32767;
										b[Ka + (J << 1) >> 1] = x;
										x = J
									}
									x = ja;
									w = Ka;
									break
								}
								x = la;
								while (1) {
									J = x + -1 | 0;
									if ((x | 0) <= 0) break;
									D = +g[Z + (J << 2) >> 2];
									G = (g[k >> 2] = D, c[k >> 2] | 0);
									p = (G & 2130706432) >>> 0 > 1249902592;
									if (!p) {
										F = (G | 0) < 0;
										B = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
										if (B == 0.0) B = F ? -0.0 : 0.0
									} else B = D;
									if ((~~B | 0) <= 32767) {
										if (!p) {
											F = (G | 0) < 0;
											B = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
											if (B == 0.0) B = F ? -0.0 : 0.0
										} else B = D;
										if ((~~B | 0) < -32768) x = -32768;
										else {
											if (!p) {
												F = (G | 0) < 0;
												D = F ? D + -8388608.0 + 8388608.0 : D + 8388608.0 + -8388608.0;
												if (D == 0.0) D = F ? -0.0 : 0.0
											}
											x = ~~D
										}
									} else x = 32767;
									b[Q + (J << 1) >> 1] = x;
									x = J
								}
								c[ja >> 2] = 0;
								c[ja + 4 >> 2] = 0;
								c[ja + 8 >> 2] = 0;
								c[ja + 12 >> 2] = 0;
								c[ja + 16 >> 2] = 0;
								c[ja + 20 >> 2] = 0;
								c[Va >> 2] = c[ja >> 2];
								c[Va + 4 >> 2] = c[ja + 4 >> 2];
								c[Va + 8 >> 2] = c[ja + 8 >> 2];
								c[Va + 12 >> 2] = c[ja + 12 >> 2];
								v = ja + 16 | 0;
								w = Va + 16 | 0;
								u = Ka;
								t = Q;
								F = la;
								while (1) {
									s = (F | 0) < 480 ? F : 480;
									ec(v, w, t, 31262, s);
									G = (((s + 3 + ((s | 0) < 2 ? ~s : -3) | 0) >>> 0) / 3 | 0) << 1;
									p = u;
									A = Va;
									q = s;
									while (1) {
										if ((q | 0) <= 2) break;
										ea = c[A >> 2] | 0;
										ga = A + 4 | 0;
										fa = c[ga >> 2] | 0;
										ka = A + 8 | 0;
										ma = c[ka >> 2] | 0;
										pa = A + 12 | 0;
										la = c[pa >> 2] | 0;
										la = (((ea >> 16) * 4697 | 0) + (((ea & 65535) * 4697 | 0) >>> 16) + (((fa >> 16) * 10739 | 0) + (((fa & 65535) * 10739 | 0) >>> 16)) + (((ma >> 16) * 8276 | 0) + (((ma & 65535) * 8276 | 0) >>> 16)) + (((la >> 16) * 1567 | 0) + (((la & 65535) * 1567 | 0) >>> 16)) >> 5) + 1 >> 1;
										b[p >> 1] = (la | 0) > 32767 ? 32767 : (la | 0) < -32768 ? -32768 : la;
										ga = c[ga >> 2] | 0;
										ka = c[ka >> 2] | 0;
										la = c[pa >> 2] | 0;
										ma = c[A + 16 >> 2] | 0;
										ma = (((ga >> 16) * 1567 | 0) + (((ga & 65535) * 1567 | 0) >>> 16) + (((ka >> 16) * 8276 | 0) + (((ka & 65535) * 8276 | 0) >>> 16)) + (((la >> 16) * 10739 | 0) + (((la & 65535) * 10739 | 0) >>> 16)) + (((ma >> 16) * 4697 | 0) + (((ma & 65535) * 4697 | 0) >>> 16)) >> 5) + 1 >> 1;
										b[p + 2 >> 1] = (ma | 0) > 32767 ? 32767 : (ma | 0) < -32768 ? -32768 : ma;
										p = p + 4 | 0;
										A = pa;
										q = q + -3 | 0
									}
									F = F - s | 0;
									if ((F | 0) <= 0) break;
									pa = Va + (s << 2) | 0;
									c[Va >> 2] = c[pa >> 2];
									c[Va + 4 >> 2] = c[pa + 4 >> 2];
									c[Va + 8 >> 2] = c[pa + 8 >> 2];
									c[Va + 12 >> 2] = c[pa + 12 >> 2];
									u = u + (G << 1) | 0;
									t = t + (s << 1) | 0
								}
								w = Va + (s << 2) | 0;
								c[ja >> 2] = c[w >> 2];
								c[ja + 4 >> 2] = c[w + 4 >> 2];
								c[ja + 8 >> 2] = c[w + 8 >> 2];
								c[ja + 12 >> 2] = c[w + 12 >> 2];
								w = va;
								while (1) {
									x = w + -1 | 0;
									if ((w | 0) <= 0) {
										x = ja;
										w = Ka;
										break e
									}
									g[Pa + (x << 2) >> 2] = +(b[Ka + (x << 1) >> 1] | 0);
									w = x
								}
							}
						while (0);
						pa = ja;
						c[pa >> 2] = 0;
						c[pa + 4 >> 2] = 0;
						dc(x, Ha, w, va);
						w = y;
						while (1) {
							x = w + -1 | 0;
							if ((w | 0) <= 0) break;
							g[Ta + (x << 2) >> 2] = +(b[Ha + (x << 1) >> 1] | 0);
							w = x
						}
						while (1) {
							x = y + -1 | 0;
							if ((y | 0) <= 1) break;
							pa = Ta + (x << 2) | 0;
							g[pa >> 2] = +g[pa >> 2] + +g[Ta + (y + -2 << 2) >> 2];
							y = x
						}
						id($ | 0, 0, U * 596 | 0) | 0;
						F = U >> 1;
						p = Fa + 256 | 0;
						Q = $ + 32 | 0;
						s = 0;
						u = Ta + 320 | 0;
						while (1) {
							if ((s | 0) >= (F | 0)) {
								y = 72;
								break
							}
							q = u + -32 | 0;
							ob(u, u + -288 | 0, Fa, 40, 65, ra);
							r = +g[p >> 2];
							D = +wc(u, 40);
							D = D + +wc(q, 40) + 16.0e4;
							g[Q >> 2] = +g[Q >> 2] + r * 2.0 / D;
							A = 8;
							while (1) {
								t = A + 1 | 0;
								if ((A | 0) == 72) break;
								pa = q + -4 | 0;
								C = +g[pa >> 2];
								r = +g[q + 156 >> 2];
								r = D + (C * C - r * r);
								ma = $ + (t << 2) | 0;
								g[ma >> 2] = +g[ma >> 2] + +g[Fa + (71 - A << 2) >> 2] * 2.0 / r;
								A = t;
								q = pa;
								D = r
							}
							s = s + 1 | 0;
							u = u + 160 | 0
						}
						while (1) {
							if ((y | 0) < 8) break;
							pa = $ + (y << 2) | 0;
							r = +g[pa >> 2];
							g[pa >> 2] = r - r * +(y | 0) * .000244140625;
							y = y + -1 | 0
						}
						t = R << 1;
						J = t + 4 | 0;
						y = 0;
						while (1) {
							if ((y | 0) >= (J | 0)) {
								A = 1;
								break
							}
							c[La + (y << 2) >> 2] = y;
							y = y + 1 | 0
						}
						while (1) {
							if ((A | 0) >= (J | 0)) break;
							F = c[$ + (A + 8 << 2) >> 2] | 0;
							D = (c[k >> 2] = F, +g[k >> 2]);
							p = A;
							while (1) {
								q = p + -1 | 0;
								if ((p | 0) <= 0) break;
								B = +g[$ + (p + 7 << 2) >> 2];
								if (!(D > B)) break;
								g[$ + (p + 8 << 2) >> 2] = B;
								c[La + (p << 2) >> 2] = c[La + (q << 2) >> 2];
								p = q
							}
							c[$ + (p + 8 << 2) >> 2] = F;
							c[La + (p << 2) >> 2] = A;
							A = A + 1 | 0
						}
						s = $ + (t + 11 << 2) | 0;
						F = t + 2 | 0;
						A = J;
						while (1) {
							if ((A | 0) >= 65) break;
							p = c[$ + (A + 8 << 2) >> 2] | 0;
							D = (c[k >> 2] = p, +g[k >> 2]);
							if (D > +g[s >> 2]) {
								q = F;
								while (1) {
									if ((q | 0) <= -1) break;
									B = +g[$ + (q + 8 << 2) >> 2];
									if (!(D > B)) break;
									g[$ + (q + 9 << 2) >> 2] = B;
									c[La + (q + 1 << 2) >> 2] = c[La + (q << 2) >> 2];
									q = q + -1 | 0
								}
								c[$ + (q + 9 << 2) >> 2] = p;
								c[La + (q + 1 << 2) >> 2] = A
							}
							A = A + 1 | 0
						}
						D = +g[Q >> 2];
						do
							if (D < .20000000298023224) {
								id(na | 0, 0, U << 2 | 0) | 0;
								g[oa >> 2] = 0.0;
								b[V >> 1] = 0;
								a[ua >> 0] = 0;
								x = 0
							} else {
								D = L * D;
								x = 0;
								while (1) {
									if ((x | 0) >= (J | 0)) {
										x = J;
										break
									}
									if (!(+g[$ + (x + 8 << 2) >> 2] > D)) break;
									pa = La + (x << 2) | 0;
									c[pa >> 2] = (c[pa >> 2] << 1) + 16;
									x = x + 1 | 0
								}
								y = 11;
								while (1) {
									if ((y | 0) == 148) {
										y = 0;
										break
									}
									b[ia + (y << 1) >> 1] = 0;
									y = y + 1 | 0
								}
								while (1) {
									if ((y | 0) >= (x | 0)) {
										y = 146;
										break
									}
									b[ia + (c[La + (y << 2) >> 2] << 1) >> 1] = 1;
									y = y + 1 | 0
								}
								while (1) {
									if ((y | 0) < 16) {
										pa = 0;
										x = 16;
										break
									}
									pa = y + -1 | 0;
									ma = ia + (y << 1) | 0;
									b[ma >> 1] = (e[ma >> 1] | 0) + ((e[ia + (pa << 1) >> 1] | 0) + (e[ia + (y + -2 << 1) >> 1] | 0));
									y = pa
								}
								while (1) {
									if ((x | 0) == 144) {
										y = 146;
										break
									}
									y = x + 1 | 0;
									if ((b[ia + (y << 1) >> 1] | 0) <= 0) {
										x = y;
										continue
									}
									c[La + (pa << 2) >> 2] = x;
									pa = pa + 1 | 0;
									x = y
								}
								while (1) {
									if ((y | 0) < 16) {
										y = 0;
										x = 16;
										break
									}
									ma = y + -1 | 0;
									la = ia + (y << 1) | 0;
									b[la >> 1] = (e[la >> 1] | 0) + ((e[ia + (ma << 1) >> 1] | 0) + (e[ia + (y + -2 << 1) >> 1] | 0) + (e[ia + (y + -3 << 1) >> 1] | 0));
									y = ma
								}
								while (1) {
									if ((x | 0) == 147) break;
									if ((b[ia + (x << 1) >> 1] | 0) > 0) {
										b[ia + (y << 1) >> 1] = x + 65534;
										y = y + 1 | 0
									}
									x = x + 1 | 0
								}
								id($ | 0, 0, 2384) | 0;
								G = (qa | 0) == 8;
								if (G) {
									A = 0;
									s = Z + 640 | 0
								} else {
									A = 0;
									s = Pa + 640 | 0
								}
								while (1) {
									if ((A | 0) >= (U | 0)) break;
									B = +wc(s, 40) + 1.0;
									q = 0;
									while (1) {
										if ((q | 0) >= (y | 0)) break;
										p = b[ia + (q << 1) >> 1] | 0;
										F = s + (0 - p << 2) | 0;
										D = +xc(F, s, 40);
										if (D > 0.0) D = D * 2.0 / (+wc(F, 40) + B);
										else D = 0.0;
										g[$ + (A * 596 | 0) + (p << 2) >> 2] = D;
										q = q + 1 | 0
									}
									A = A + 1 | 0;
									s = s + 160 | 0
								}
								if ((E | 0) > 0) {
									ma = (qa | 0) == 12 ? (E << 1 | 0) / 3 | 0 : xa ? E >> 1 : E;
									E = ma;
									P = +fd(+(ma | 0)) * 3.32192809488736
								} else P = 0.0;
								va = (U | 0) == 4;
								if (va) {
									ga = 36267;
									fa = 11;
									q = G & (R | 0) > 0 ? 11 : 3
								} else {
									ga = 36233;
									fa = 3;
									q = 3
								}
								M = +(U | 0);
								K = M * .20000000298023224;
								p = (E | 0) > 0;
								L = M * wa;
								x = 0;
								G = 0;
								F = -998637568;
								A = -1;
								E = 0;
								while (1) {
									if ((E | 0) >= (pa | 0)) break;
									Q = c[La + (E << 2) >> 2] | 0;
									I = 0;
									while (1) {
										if ((I | 0) >= (q | 0)) {
											I = 0;
											H = -998637568;
											J = 0;
											break
										}
										J = Ia + (I << 2) | 0;
										g[J >> 2] = 0.0;
										D = 0.0;
										H = 0;
										while (1) {
											if ((H | 0) >= (U | 0)) break;
											r = D + +g[$ + (H * 596 | 0) + (Q + (a[ga + ((_(H, fa) | 0) + I) >> 0] | 0) << 2) >> 2];
											g[J >> 2] = r;
											D = r;
											H = H + 1 | 0
										}
										I = I + 1 | 0
									}
									while (1) {
										if ((J | 0) >= (q | 0)) break;
										D = +g[Ia + (J << 2) >> 2];
										ma = D > (c[k >> 2] = H, +g[k >> 2]);
										I = ma ? J : I;
										H = ma ? (g[k >> 2] = D, c[k >> 2] | 0) : H;
										J = J + 1 | 0
									}
									B = +fd(+(Q | 0)) * 3.32192809488736;
									z = (c[k >> 2] = H, +g[k >> 2]);
									D = z - K * B;
									if (p) {
										r = B - P;
										r = r * r;
										D = D - K * +g[oa >> 2] * r / (r + .5)
									}
									la = (g[k >> 2] = D, c[k >> 2] | 0);
									ma = D > (c[k >> 2] = F, +g[k >> 2]) & z > L;
									x = ma ? I : x;
									G = ma ? H : G;
									F = ma ? la : F;
									A = ma ? Q : A;
									E = E + 1 | 0
								}
								if ((A | 0) == -1) {
									c[na >> 2] = 0;
									c[na + 4 >> 2] = 0;
									c[na + 8 >> 2] = 0;
									c[na + 12 >> 2] = 0;
									g[oa >> 2] = 0.0;
									b[V >> 1] = 0;
									a[ua >> 0] = 0;
									x = 0;
									break
								}
								g[oa >> 2] = (c[k >> 2] = G, +g[k >> 2]) / M;
								if ((qa | 0) > 8) {
									if ((qa | 0) == 12) {
										y = (A << 16 >> 16) * 3 | 0;
										y = (y >> 1) + (y & 1) | 0
									} else y = A << 1;
									if ((ta | 0) > (T | 0))
										if ((y | 0) > (ta | 0)) ka = ta;
										else ka = (y | 0) < (T | 0) ? T : y;
									else if ((y | 0) > (T | 0)) ka = T;
									else ka = (y | 0) < (ta | 0) ? ta : y;
									la = ka + -2 | 0;
									la = (la | 0) > (ta | 0) ? la : ta;
									pa = ka + 2 | 0;
									pa = (pa | 0) < (T | 0) ? pa : T;
									if (va) {
										q = 36311;
										t = 36447 + (R << 3) | 0;
										u = 34;
										w = a[36471 + R >> 0] | 0
									} else {
										q = 36239;
										t = 36263;
										u = 12;
										w = 12
									}
									s = Z + (qa * 20 << 2) | 0;
									v = 0;
									x = s;
									while (1) {
										if ((v | 0) >= (U | 0)) break;
										F = v << 1;
										G = a[t + F >> 0] | 0;
										F = a[t + (F | 1) >> 0] | 0;
										ob(x, x + (0 - (la + F) << 2) | 0, Va, S, F - G + 1 | 0, ra);
										E = 0;
										p = G;
										while (1) {
											if ((F | 0) < (p | 0)) break;
											c[Ua + (E << 2) >> 2] = c[Va + (F - p << 2) >> 2];
											E = E + 1 | 0;
											p = p + 1 | 0
										}
										F = _(v, u) | 0;
										p = 0;
										while (1) {
											if ((p | 0) >= (w | 0)) break;
											E = (a[q + (F + p) >> 0] | 0) - G | 0;
											A = 0;
											while (1) {
												if ((A | 0) == 5) break;
												c[Qa + (v * 680 | 0) + (p * 20 | 0) + (A << 2) >> 2] = c[Ua + (E + A << 2) >> 2];
												A = A + 1 | 0
											}
											p = p + 1 | 0
										}
										v = v + 1 | 0;
										x = x + (S << 2) | 0
									}
									if (va) {
										G = 36311;
										t = 36447 + (R << 3) | 0;
										u = 34;
										w = a[36471 + R >> 0] | 0
									} else {
										G = 36239;
										t = 36263;
										u = 12;
										w = 12
									}
									v = 0;
									while (1) {
										if ((v | 0) >= (U | 0)) break;
										E = v << 1;
										q = a[t + E >> 0] | 0;
										F = la + q | 0;
										D = +wc(s + (0 - F << 2) | 0, S) + .001;
										g[Ua >> 2] = D;
										E = (a[t + (E | 1) >> 0] | 0) - q + 1 | 0;
										p = 1;
										while (1) {
											if ((p | 0) >= (E | 0)) break;
											C = +g[s + (S - p - F << 2) >> 2];
											r = +g[s + (0 - (F + p) << 2) >> 2];
											r = D - C * C + r * r;
											g[Ua + (p << 2) >> 2] = r;
											D = r;
											p = p + 1 | 0
										}
										F = _(v, u) | 0;
										p = 0;
										while (1) {
											if ((p | 0) >= (w | 0)) break;
											E = (a[G + (F + p) >> 0] | 0) - q | 0;
											A = 0;
											while (1) {
												if ((A | 0) == 5) break;
												c[Ra + (v * 680 | 0) + (p * 20 | 0) + (A << 2) >> 2] = c[Ua + (E + A << 2) >> 2];
												A = A + 1 | 0
											}
											p = p + 1 | 0
										}
										v = v + 1 | 0;
										s = s + (S << 2) | 0
									}
									L = .05000000074505806 / +(ka | 0);
									if (va) {
										Q = 36311;
										H = 34;
										I = a[36471 + R >> 0] | 0
									} else {
										Q = 36239;
										H = 12;
										I = 12
									}
									z = +wc(Z + (qa * 20 << 2) | 0, _(U, S) | 0) + 1.0;
									x = 0;
									y = -998637568;
									J = 0;
									F = ka;
									G = la;
									while (1) {
										if ((G | 0) > (pa | 0)) break;
										else {
											w = F;
											F = 0
										}
										while (1) {
											if ((F | 0) < (I | 0)) {
												D = 0.0;
												B = z;
												v = 0
											} else break;
											while (1) {
												if ((v | 0) >= (U | 0)) break;
												D = D + +g[Qa + (v * 680 | 0) + (F * 20 | 0) + (J << 2) >> 2];
												B = B + +g[Ra + (v * 680 | 0) + (F * 20 | 0) + (J << 2) >> 2];
												v = v + 1 | 0
											}
											if (D > 0.0) D = D * 2.0 / B * (1.0 - L * +(F | 0));
											else D = 0.0;
											v = (g[k >> 2] = D, c[k >> 2] | 0);
											if (D > (c[k >> 2] = y, +g[k >> 2])) {
												ma = (G + (a[36311 + F >> 0] | 0) | 0) > (T | 0);
												x = ma ? x : F;
												y = ma ? y : v;
												w = ma ? w : G
											}
											F = F + 1 | 0
										}
										J = J + 1 | 0;
										F = w;
										G = G + 1 | 0
									}
									v = (ta | 0) > (sa | 0);
									u = 0;
									while (1) {
										if ((u | 0) >= (U | 0)) break;
										y = F + (a[Q + ((_(u, H) | 0) + x) >> 0] | 0) | 0;
										w = cb + 228 + (u << 2) | 0;
										c[w >> 2] = y;
										do
											if (v) {
												if ((y | 0) > (ta | 0)) {
													y = ta;
													break
												}
												y = (y | 0) < (sa | 0) ? sa : y
											} else {
												if ((y | 0) > (sa | 0)) {
													y = sa;
													break
												}
												y = (y | 0) < (ta | 0) ? ta : y
											}
										while (0);
										c[w >> 2] = y;
										u = u + 1 | 0
									}
									y = F - ta | 0
								} else {
									y = 0;
									while (1) {
										if ((y | 0) >= (U | 0)) break;
										ma = A + (a[ga + ((_(y, fa) | 0) + x) >> 0] | 0) | 0;
										pa = cb + 228 + (y << 2) | 0;
										c[pa >> 2] = ma;
										c[pa >> 2] = (ma | 0) > 144 ? 144 : (ma | 0) < 16 ? 16 : ma;
										y = y + 1 | 0
									}
									y = A + 65520 | 0
								}
								b[V >> 1] = y;
								a[ua >> 0] = x;
								x = 1
							}
						while (0);
						if (x) {
							a[Wa >> 0] = 2;
							break
						} else {
							a[Wa >> 0] = 1;
							break
						}
					} else jb = 255;
				while (0);
				if ((jb | 0) == 255) {
					pa = cb + 228 | 0;
					c[pa >> 2] = 0;
					c[pa + 4 >> 2] = 0;
					c[pa + 8 >> 2] = 0;
					c[pa + 12 >> 2] = 0;
					b[f + 4794 >> 1] = 0;
					a[f + 4796 >> 0] = 0;
					g[f + 12236 >> 2] = 0.0
				}
				J = f + 9356 + (Ja - (c[f + 4624 >> 2] | 0) << 2) | 0;
				za = f + 4748 | 0;
				z = +(c[za >> 2] | 0) * .0078125;
				xa = f + 4728 | 0;
				B = +((c[xa >> 2] | 0) + (c[f + 4732 >> 2] | 0) | 0) * .5 * .000030517578125;
				Aa = cb + 856 | 0;
				g[Aa >> 2] = B;
				r = 1.0 / (+X(+ -((z + -20.0) * .25)) + 1.0);
				Ea = cb + 860 | 0;
				g[Ea >> 2] = r;
				if (!(c[f + 4708 >> 2] | 0)) {
					C = 1.0 - +(c[f + 4556 >> 2] | 0) * .00390625;
					z = z - r * 2.0 * (B * .5 + .5) * C * C
				}
				if ((a[Wa >> 0] | 0) == 2) {
					wa = z + +g[f + 12236 >> 2] * 2.0;
					a[f + 4798 >> 0] = 0;
					g[cb + 864 >> 2] = 0.0
				} else {
					r = z + (+(c[za >> 2] | 0) * -.4000000059604645 * .0078125 + 6.0) * (1.0 - B);
					u = c[Ya >> 2] << 1;
					t = ((c[f + 4604 >> 2] << 16 >> 16) * 5 | 0) / 2 | 0;
					C = +(u | 0);
					B = 0.0;
					x = 0;
					w = Y;
					v = 0;
					while (1) {
						if ((v | 0) >= (t | 0)) break;
						z = +fd(C + +wc(w, u)) * 3.32192809488736;
						y = (g[k >> 2] = z, c[k >> 2] | 0);
						if ((v | 0) > 0) B = B + +N(+(z - (c[k >> 2] = x, +g[k >> 2])));
						x = y;
						w = w + (u << 2) | 0;
						v = v + 1 | 0
					}
					wa = 1.0 / (+X(+ -((B + -5.0) * .4000000059604645)) + 1.0);
					pa = cb + 864 | 0;
					g[pa >> 2] = wa;
					a[f + 4798 >> 0] = wa > .75 ? 0 : 1;
					wa = r + (+g[pa >> 2] + -.5) * 2.0
				}
				P = +g[W >> 2] * 1.0000000474974513e-03;
				P = .949999988079071 / (P * P + 1.0);
				B = +g[Ea >> 2];
				r = (1.0 - B * .75) * .009999999776482582;
				C = P + r;
				r = (P - r) / C;
				Da = f + 4704 | 0;
				y = c[Da >> 2] | 0;
				if ((y | 0) > 0) P = +(y | 0) * .0000152587890625 + B * .009999999776482582;
				else P = 0.0;
				Ga = f + 4604 | 0;
				va = f + 4628 | 0;
				Ba = f + 4612 | 0;
				Ca = f + 4660 | 0;
				L = P;
				Q = ya + 4 | 0;
				M = -P;
				K = 1.0 - P * P;
				H = 0;
				x = J;
				while (1) {
					y = c[Ga >> 2] | 0;
					if ((H | 0) >= (y | 0)) break;
					pa = c[Ya >> 2] | 0;
					E = pa * 3 | 0;
					s = ((c[va >> 2] | 0) - E | 0) / 2 | 0;
					pc(Pa, x, 1, s);
					nd(Pa + (s << 2) | 0, x + (s << 2) | 0, pa * 12 | 0) | 0;
					E = s + E | 0;
					pc(Pa + (E << 2) | 0, x + (E << 2) | 0, 2, s);
					x = x + (c[Ba >> 2] << 2) | 0;
					s = c[va >> 2] | 0;
					E = c[Ca >> 2] | 0;
					f: do
						if ((c[Da >> 2] | 0) > 0) {
							id(Va | 0, 0, 136) | 0;
							id(Ua | 0, 0, 136) | 0;
							p = Va + (E << 3) | 0;
							A = Ua + (E << 3) | 0;
							D = 0.0;
							q = 0;
							while (1) {
								if ((q | 0) >= (s | 0)) break;
								F = 0;
								B = +g[Pa + (q << 2) >> 2];
								while (1) {
									if ((F | 0) >= (E | 0)) break;
									ma = F | 1;
									la = Va + (ma << 3) | 0;
									mb = +h[la >> 3];
									z = D + L * (mb - B);
									h[Va + (F << 3) >> 3] = B;
									pa = Ua + (F << 3) | 0;
									h[pa >> 3] = +h[pa >> 3] + +h[Va >> 3] * B;
									pa = F + 2 | 0;
									lb = +h[Va + (pa << 3) >> 3];
									h[la >> 3] = z;
									ma = Ua + (ma << 3) | 0;
									h[ma >> 3] = +h[ma >> 3] + +h[Va >> 3] * z;
									D = lb;
									F = pa;
									B = mb + L * (lb - z)
								}
								h[p >> 3] = B;
								D = +h[Va >> 3];
								h[A >> 3] = +h[A >> 3] + D * B;
								q = q + 1 | 0
							}
							y = E + 1 | 0;
							w = 0;
							while (1) {
								if ((w | 0) >= (y | 0)) break;
								g[ya + (w << 2) >> 2] = +h[Ua + (w << 3) >> 3];
								w = w + 1 | 0
							}
						} else {
							y = (E | 0) < (s | 0) ? E + 1 | 0 : s;
							w = 0;
							while (1) {
								if ((w | 0) >= (y | 0)) break f;
								g[ya + (w << 2) >> 2] = +xc(Pa, Pa + (w << 2) | 0, s - w | 0);
								w = w + 1 | 0
							}
						}
					while (0);
					z = +g[ya >> 2];
					z = z + z * 4.999999873689376e-05;
					g[ya >> 2] = z;
					pa = H << 4;
					ma = cb + 500 + (pa << 2) | 0;
					G = c[Ca >> 2] | 0;
					B = z * 9.999999960041972e-13 + 9.999999717180685e-10;
					g[Va >> 2] = B;
					g[Ua >> 2] = z;
					z = B > z ? B : z;
					D = +g[Q >> 2];
					mb = D / z;
					g[ma >> 2] = mb;
					D = z - mb * D;
					g[Ua >> 2] = D;
					F = c[(B > D ? Va : Ua) >> 2] | 0;
					c[Ua >> 2] = F;
					q = 1;
					while (1) {
						if ((q | 0) >= (G | 0)) break;
						A = q + 1 | 0;
						E = 0;
						p = c[ya + (A << 2) >> 2] | 0;
						while (1) {
							if ((q | 0) == (E | 0)) break;
							la = (g[k >> 2] = (c[k >> 2] = p, +g[k >> 2]) - +g[cb + 500 + (pa + E << 2) >> 2] * +g[ya + (q - E << 2) >> 2], c[k >> 2] | 0);
							E = E + 1 | 0;
							p = la
						}
						mb = (c[k >> 2] = p, +g[k >> 2]);
						z = (c[k >> 2] = F, +g[k >> 2]);
						D = mb / z;
						mb = z - D * mb;
						g[Ua >> 2] = mb;
						F = c[(B > mb ? Va : Ua) >> 2] | 0;
						c[Ua >> 2] = F;
						E = q >> 1;
						p = 0;
						while (1) {
							if ((p | 0) >= (E | 0)) break;
							la = cb + 500 + (pa + p << 2) | 0;
							ka = cb + 500 + (pa + (q - p + -1) << 2) | 0;
							mb = +g[ka >> 2];
							g[ka >> 2] = mb - D * +g[la >> 2];
							g[la >> 2] = +g[la >> 2] - D * mb;
							p = p + 1 | 0
						}
						if (q & 1) {
							la = cb + 500 + (pa + E << 2) | 0;
							mb = +g[la >> 2];
							g[la >> 2] = mb - D * mb
						}
						g[cb + 500 + (pa + q << 2) >> 2] = D;
						q = A
					}
					B = +O(+(c[k >> 2] = F, +g[k >> 2]));
					E = cb + (H << 2) | 0;
					g[E >> 2] = B;
					if ((c[Da >> 2] | 0) > 0) {
						p = c[Ca >> 2] | 0;
						F = c[cb + 500 + (pa + (p + -1) << 2) >> 2] | 0;
						p = p + -2 | 0;
						while (1) {
							D = (c[k >> 2] = F, +g[k >> 2]) * M;
							if ((p | 0) <= -1) break;
							F = (g[k >> 2] = D + +g[cb + 500 + (pa + p << 2) >> 2], c[k >> 2] | 0);
							p = p + -1 | 0
						}
						g[E >> 2] = B * (1.0 / (1.0 - D))
					}
					y = (c[Ca >> 2] | 0) + -1 | 0;
					D = C;
					w = 0;
					while (1) {
						if ((w | 0) >= (y | 0)) break;
						la = cb + 500 + (pa + w << 2) | 0;
						g[la >> 2] = +g[la >> 2] * D;
						D = D * C;
						w = w + 1 | 0
					}
					la = cb + 500 + (pa + y << 2) | 0;
					g[la >> 2] = +g[la >> 2] * D;
					la = cb + 244 + (pa << 2) | 0;
					nd(la | 0, ma | 0, c[Ca >> 2] << 2 | 0) | 0;
					E = (c[Ca >> 2] | 0) + -1 | 0;
					D = r;
					F = 0;
					while (1) {
						if ((F | 0) >= (E | 0)) break;
						ka = cb + 244 + (pa + F << 2) | 0;
						g[ka >> 2] = +g[ka >> 2] * D;
						D = D * r;
						F = F + 1 | 0
					}
					ba = cb + 244 + (pa + E << 2) | 0;
					g[ba >> 2] = +g[ba >> 2] * D;
					D = +yc(ma, c[Ca >> 2] | 0);
					g[cb + 788 + (H << 2) >> 2] = 1.0 - (1.0 - D / +yc(la, c[Ca >> 2] | 0)) * .699999988079071;
					ba = c[Ca >> 2] | 0;
					E = ba;
					while (1) {
						F = E + -1 | 0;
						if ((E | 0) <= 1) break;
						ka = E + -2 | 0;
						ga = cb + 500 + (pa + ka << 2) | 0;
						g[ga >> 2] = +g[ga >> 2] - P * +g[cb + 500 + (pa + F << 2) >> 2];
						ka = cb + 244 + (pa + ka << 2) | 0;
						g[ka >> 2] = +g[ka >> 2] - P * +g[cb + 244 + (pa + F << 2) >> 2];
						E = F
					}
					B = K / (P * +g[ma >> 2] + 1.0);
					D = K / (P * +g[la >> 2] + 1.0);
					F = 0;
					while (1) {
						if ((F | 0) >= (ba | 0)) break;
						ka = cb + 500 + (pa + F << 2) | 0;
						g[ka >> 2] = +g[ka >> 2] * B;
						ka = cb + 244 + (pa + F << 2) | 0;
						g[ka >> 2] = +g[ka >> 2] * D;
						F = F + 1 | 0
					}
					ea = ba + -1 | 0;
					da = cb + 500 + (pa + ea << 2) | 0;
					ca = cb + 244 + (pa + ea << 2) | 0;
					F = 0;
					fa = 0;
					while (1) {
						if ((fa | 0) < 10) {
							ga = F;
							J = -1082130432;
							I = 0
						} else break;
						while (1) {
							if ((I | 0) >= (ba | 0)) break;
							mb = +N(+(+g[cb + 500 + (pa + I << 2) >> 2]));
							z = +N(+(+g[cb + 244 + (pa + I << 2) >> 2]));
							z = mb > z ? mb : z;
							ka = z > (c[k >> 2] = J, +g[k >> 2]);
							ga = ka ? I : ga;
							J = ka ? (g[k >> 2] = z, c[k >> 2] | 0) : J;
							I = I + 1 | 0
						}
						z = (c[k >> 2] = J, +g[k >> 2]);
						if (!(z <= 3.999000072479248)) G = 1;
						else break;
						while (1) {
							if ((G | 0) >= (ba | 0)) break;
							ka = G + -1 | 0;
							Y = cb + 500 + (pa + ka << 2) | 0;
							g[Y >> 2] = +g[Y >> 2] + P * +g[cb + 500 + (pa + G << 2) >> 2];
							ka = cb + 244 + (pa + ka << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] + P * +g[cb + 244 + (pa + G << 2) >> 2];
							G = G + 1 | 0
						}
						B = 1.0 / B;
						D = 1.0 / D;
						G = 0;
						while (1) {
							if ((G | 0) >= (ba | 0)) break;
							ka = cb + 500 + (pa + G << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] * B;
							ka = cb + 244 + (pa + G << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] * D;
							G = G + 1 | 0
						}
						B = .9900000095367432 - (+(fa | 0) * .10000000149011612 + .800000011920929) * (z + -3.999000072479248) / (z * +(ga + 1 | 0));
						D = B;
						G = 0;
						while (1) {
							if ((G | 0) >= (ea | 0)) break;
							ka = cb + 500 + (pa + G << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] * D;
							D = D * B;
							G = G + 1 | 0
						}
						g[da >> 2] = +g[da >> 2] * D;
						D = B;
						G = 0;
						while (1) {
							if ((G | 0) >= (ea | 0)) break;
							ka = cb + 244 + (pa + G << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] * D;
							D = D * B;
							G = G + 1 | 0
						}
						g[ca >> 2] = +g[ca >> 2] * D;
						F = ba;
						while (1) {
							E = F + -1 | 0;
							if ((F | 0) <= 1) break;
							ka = F + -2 | 0;
							Y = cb + 500 + (pa + ka << 2) | 0;
							g[Y >> 2] = +g[Y >> 2] - P * +g[cb + 500 + (pa + E << 2) >> 2];
							ka = cb + 244 + (pa + ka << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] - P * +g[cb + 244 + (pa + E << 2) >> 2];
							F = E
						}
						B = K / (P * +g[ma >> 2] + 1.0);
						D = K / (P * +g[la >> 2] + 1.0);
						G = 0;
						while (1) {
							if ((G | 0) >= (ba | 0)) break;
							ka = cb + 500 + (pa + G << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] * B;
							ka = cb + 244 + (pa + G << 2) | 0;
							g[ka >> 2] = +g[ka >> 2] * D;
							G = G + 1 | 0
						}
						F = ga;
						fa = fa + 1 | 0
					}
					H = H + 1 | 0
				}
				B = +ed(wa * -.1599999964237213);
				x = 0;
				while (1) {
					if ((x | 0) >= (y | 0)) break;
					y = cb + (x << 2) | 0;
					g[y >> 2] = +g[y >> 2] * B + 1.2483305931091309;
					y = c[Ga >> 2] | 0;
					x = x + 1 | 0
				}
				B = +g[Ea >> 2] * .10000000149011612 + 1.0499999523162842;
				x = 0;
				while (1) {
					if ((x | 0) >= (y | 0)) break;
					y = cb + 788 + (x << 2) | 0;
					g[y >> 2] = +g[y >> 2] * B;
					y = c[Ga >> 2] | 0;
					x = x + 1 | 0
				}
				ya = f + 4556 | 0;
				B = ((+(c[xa >> 2] | 0) * .000030517578125 + -1.0) * .5 + 1.0) * 4.0 * (+(c[ya >> 2] | 0) * .00390625);
				g: do
					if ((a[Wa >> 0] | 0) == 2) {
						x = 0;
						while (1) {
							if ((x | 0) >= (y | 0)) break;
							L = .20000000298023224 / +(c[Ya >> 2] | 0) + 3.0 / +(c[cb + 228 + (x << 2) >> 2] | 0);
							g[cb + 756 + (x << 2) >> 2] = L + -1.0;
							g[cb + 772 + (x << 2) >> 2] = 1.0 - L - L * B;
							y = c[Ga >> 2] | 0;
							x = x + 1 | 0
						}
						D = -.25 - +(c[ya >> 2] | 0) * .26249998807907104 * .00390625
					} else {
						L = 1.2999999523162842 / +(c[Ya >> 2] | 0);
						w = cb + 756 | 0;
						g[w >> 2] = L + -1.0;
						v = cb + 772 | 0;
						g[v >> 2] = 1.0 - L - L * B * .6000000238418579;
						x = 1;
						while (1) {
							y = c[Ga >> 2] | 0;
							if ((x | 0) >= (y | 0)) {
								D = -.25;
								break g
							}
							c[cb + 756 + (x << 2) >> 2] = c[w >> 2];
							c[cb + 772 + (x << 2) >> 2] = c[v >> 2];
							x = x + 1 | 0
						}
					}
				while (0);
				B = 1.0 - +g[Ea >> 2];
				z = +g[f + 12236 >> 2];
				r = +g[Aa >> 2];
				C = B * .10000000149011612 * z + (1.0 - r) * .10000000149011612;
				if ((a[Wa >> 0] | 0) == 2) B = ((1.0 - B * r) * .20000000298023224 + .30000001192092896) * +O(+z);
				else B = 0.0;
				w = f + 7204 | 0;
				v = f + 7208 | 0;
				u = f + 7212 | 0;
				x = 0;
				while (1) {
					if ((x | 0) >= (y | 0)) break;
					L = +g[w >> 2];
					L = L + (C - L) * .4000000059604645;
					g[w >> 2] = L;
					g[cb + 804 + (x << 2) >> 2] = L;
					L = +g[v >> 2];
					L = L + (B - L) * .4000000059604645;
					g[v >> 2] = L;
					g[cb + 836 + (x << 2) >> 2] = L;
					L = +g[u >> 2];
					L = L + (D - L) * .4000000059604645;
					g[u >> 2] = L;
					g[cb + 820 + (x << 2) >> 2] = L;
					y = c[Ga >> 2] | 0;
					x = x + 1 | 0
				}
				y = 0;
				while (1) {
					x = c[Ga >> 2] | 0;
					if ((y | 0) >= (x | 0)) break;
					L = 1.0 / +g[cb + (y << 2) >> 2];
					g[La + (y << 2) >> 2] = L;
					g[ia + (y << 2) >> 2] = L * L;
					y = y + 1 | 0
				}
				if ((a[Wa >> 0] | 0) == 2) {
					ka = c[Ba >> 2] | 0;
					va = cb + 144 | 0;
					L = +(ka | 0) * .009999999776482582;
					y = Ia;
					J = va;
					ma = Z + (c[$a >> 2] << 2) | 0;
					la = 0;
					while (1) {
						if ((la | 0) >= (x | 0)) break;
						p = -2 - (c[cb + 228 + (la << 2) >> 2] | 0) | 0;
						E = p + 4 | 0;
						A = ma + (E << 2) | 0;
						B = +wc(A, ka);
						pa = y;
						g[pa >> 2] = B;
						y = 1;
						while (1) {
							if ((y | 0) == 5) break;
							mb = +g[ma + (E - y << 2) >> 2];
							D = +g[ma + (E + (ka - y) << 2) >> 2];
							D = B + (mb * mb - D * D);
							g[pa + (y * 6 << 2) >> 2] = D;
							B = D;
							y = y + 1 | 0
						}
						w = ma + (p + 3 << 2) | 0;
						v = 1;
						while (1) {
							if ((v | 0) == 5) break;
							D = +xc(A, w, ka);
							mb = D;
							g[pa + (v * 5 << 2) >> 2] = mb;
							g[pa + (v << 2) >> 2] = mb;
							y = 5 - v | 0;
							u = 1;
							while (1) {
								if ((u | 0) >= (y | 0)) break;
								ga = ka - u | 0;
								mb = D + (+g[ma + (E - u << 2) >> 2] * +g[w + (0 - u << 2) >> 2] - +g[ma + (E + ga << 2) >> 2] * +g[w + (ga << 2) >> 2]);
								wa = mb;
								ga = v + u | 0;
								g[pa + ((ga * 5 | 0) + u << 2) >> 2] = wa;
								g[pa + ((u * 5 | 0) + ga << 2) >> 2] = wa;
								D = mb;
								u = u + 1 | 0
							}
							w = w + -4 | 0;
							v = v + 1 | 0
						}
						y = ma + (p + 4 << 2) | 0;
						w = 0;
						while (1) {
							if ((w | 0) == 5) break;
							g[$ + (w << 2) >> 2] = +xc(y, ma, ka);
							y = y + -4 | 0;
							w = w + 1 | 0
						}
						B = +wc(ma, ka);
						ga = Fa + (la << 2) | 0;
						g[ga >> 2] = B;
						fa = pa + 96 | 0;
						B = (B + 1.0 + +g[pa >> 2] + +g[fa >> 2]) * .01666666753590107;
						y = 0;
						while (1) {
							if ((y | 0) == 5) break;
							ea = pa + (y * 6 << 2) | 0;
							g[ea >> 2] = +g[ea >> 2] + B;
							y = y + 1 | 0
						}
						g[ga >> 2] = +g[ga >> 2] + B;
						z = (+g[pa >> 2] + +g[fa >> 2]) * 4.999999873689376e-06;
						y = 1;
						w = 0;
						h: while (1) {
							if ((w | 0) < 5 & (y | 0) == 1) s = 0;
							else break;
							i: while (1) {
								if ((s | 0) >= 5) {
									jb = 390;
									break
								}
								q = s * 5 | 0;
								v = s * 6 | 0;
								y = 0;
								D = +g[pa + (v << 2) >> 2];
								while (1) {
									if ((y | 0) == (s | 0)) break;
									wa = +g[Ua + (q + y << 2) >> 2];
									mb = wa * +g[Ma + (y << 2) >> 2];
									g[Na + (y << 2) >> 2] = mb;
									y = y + 1 | 0;
									D = D - wa * mb
								}
								c[Va >> 2] = s;
								if (D < z) break;
								g[Ma + (s << 2) >> 2] = D;
								B = 1.0 / D;
								g[Pa + (s << 2) >> 2] = B;
								g[Ua + (v << 2) >> 2] = 1.0;
								E = s + 1 | 0;
								p = Ua + (E * 5 << 2) | 0;
								F = s;
								while (1) {
									A = F + 1 | 0;
									c[Va >> 2] = A;
									if ((F | 0) == 4) {
										s = E;
										continue i
									} else {
										F = 0;
										D = 0.0
									}
									while (1) {
										if ((F | 0) == (s | 0)) break;
										mb = D + +g[p + (F << 2) >> 2] * +g[Na + (F << 2) >> 2];
										F = F + 1 | 0;
										D = mb
									}
									g[Ua + ((A * 5 | 0) + s << 2) >> 2] = (+g[pa + (q + A << 2) >> 2] - D) * B;
									p = p + 20 | 0;
									F = A
								}
							}
							if ((jb | 0) == 390) {
								jb = 0;
								y = 0;
								w = w + 1 | 0;
								continue
							}
							w = w + 1 | 0;
							D = +(w | 0) * z - D;
							y = 0;
							while (1) {
								c[Va >> 2] = y;
								if ((y | 0) >= 5) {
									y = 1;
									continue h
								}
								ea = pa + (y * 6 << 2) | 0;
								g[ea >> 2] = +g[ea >> 2] + D;
								y = (c[Va >> 2] | 0) + 1 | 0
							}
						}
						w = 0;
						while (1) {
							if ((w | 0) == 5) {
								y = 0;
								break
							}
							y = w * 5 | 0;
							v = 0;
							D = 0.0;
							while (1) {
								if ((v | 0) == (w | 0)) break;
								mb = D + +g[Ua + (y + v << 2) >> 2] * +g[ha + (v << 2) >> 2];
								v = v + 1 | 0;
								D = mb
							}
							g[ha + (w << 2) >> 2] = +g[$ + (w << 2) >> 2] - D;
							w = w + 1 | 0
						}
						while (1) {
							if ((y | 0) == 5) break;
							ea = ha + (y << 2) | 0;
							g[ea >> 2] = +g[ea >> 2] * +g[Pa + (y << 2) >> 2];
							y = y + 1 | 0
						}
						c[Va >> 2] = 5;
						y = 5;
						while (1) {
							u = y + -1 | 0;
							if ((y | 0) <= 0) break;
							v = c[Va >> 2] | 0;
							w = v;
							D = 0.0;
							while (1) {
								y = w + -1 | 0;
								if ((y | 0) <= (u | 0)) break;
								mb = +g[Ua + (u + (_(y, v) | 0) << 2) >> 2];
								w = y;
								D = D + mb * +g[J + (y << 2) >> 2]
							}
							g[J + (u << 2) >> 2] = +g[ha + (u << 2) >> 2] - D;
							y = u
						}
						C = +g[ga >> 2];
						y = 0;
						z = (+g[pa >> 2] + +g[fa >> 2]) * 9.99999993922529e-09;
						F = 0;
						while (1) {
							if ((F | 0) < 10) {
								y = 0;
								D = 0.0
							} else break;
							while (1) {
								c[Va >> 2] = y;
								if ((y | 0) == 5) break;
								mb = D + +g[$ + (y << 2) >> 2] * +g[J + (y << 2) >> 2];
								y = y + 1 | 0;
								D = mb
							}
							B = C - D * 2.0;
							v = 0;
							while (1) {
								y = (g[k >> 2] = B, c[k >> 2] | 0);
								c[Va >> 2] = v;
								if ((v | 0) == 5) break;
								else {
									D = 0.0;
									w = v
								}
								while (1) {
									y = w + 1 | 0;
									if ((w | 0) == 4) break;
									D = D + +g[pa + (v + (y * 5 | 0) << 2) >> 2] * +g[J + (y << 2) >> 2];
									w = y
								}
								mb = +g[J + (v << 2) >> 2];
								B = B + mb * (D * 2.0 + +g[pa + (v * 6 << 2) >> 2] * mb);
								v = v + 1 | 0
							}
							if (B > 0.0) break;
							else w = 0;
							while (1) {
								c[Va >> 2] = w;
								if ((w | 0) >= 5) break;
								ga = pa + (w * 6 << 2) | 0;
								g[ga >> 2] = +g[ga >> 2] + z;
								w = (c[Va >> 2] | 0) + 1 | 0
							}
							z = z * 2.0;
							F = F + 1 | 0
						}
						y = (F | 0) == 10 ? 1065353216 : y;
						c[ja + (la << 2) >> 2] = y;
						B = +g[ia + (la << 2) >> 2];
						B = B / ((c[k >> 2] = y, +g[k >> 2]) * B + L);
						y = 0;
						while (1) {
							if ((y | 0) >= 24) {
								y = 24;
								break
							}
							ga = pa + (y << 2) | 0;
							g[ga >> 2] = +g[ga >> 2] * B;
							ga = pa + ((y | 1) << 2) | 0;
							g[ga >> 2] = +g[ga >> 2] * B;
							ga = pa + ((y | 2) << 2) | 0;
							g[ga >> 2] = +g[ga >> 2] * B;
							ga = pa + ((y | 3) << 2) | 0;
							g[ga >> 2] = +g[ga >> 2] * B;
							y = y + 4 | 0
						}
						while (1) {
							if ((y | 0) == 25) break;
							ga = pa + (y << 2) | 0;
							g[ga >> 2] = +g[ga >> 2] * B;
							y = y + 1 | 0
						}
						c[Ha + (la << 2) >> 2] = c[pa + 48 >> 2];
						y = pa + 100 | 0;
						J = J + 20 | 0;
						ma = ma + (ka << 2) | 0;
						la = la + 1 | 0
					}
					xa = cb + 872 | 0;
					z = 9.999999974752427e-07;
					r = 0.0;
					y = 0;
					while (1) {
						if ((y | 0) >= (x | 0)) break;
						L = +g[ia + (y << 2) >> 2];
						z = z + +g[ja + (y << 2) >> 2] * L;
						r = r + +g[Fa + (y << 2) >> 2] * L;
						y = y + 1 | 0
					}
					g[xa >> 2] = +fd(r / z) * 3.32192809488736 * 3.0;
					y = va;
					u = 0;
					while (1) {
						if ((u | 0) >= (x | 0)) {
							y = 0;
							r = 1.0000000474974513e-03;
							break
						}
						v = Ta + (u << 2) | 0;
						g[v >> 2] = 0.0;
						z = 0.0;
						w = 0;
						while (1) {
							if ((w | 0) == 5) break;
							L = z + +g[y + (w << 2) >> 2];
							g[v >> 2] = L;
							z = L;
							w = w + 1 | 0
						}
						y = y + 20 | 0;
						u = u + 1 | 0
					}
					while (1) {
						if ((y | 0) >= (x | 0)) {
							z = 0.0;
							y = 0;
							break
						}
						L = r + +g[Ha + (y << 2) >> 2];
						y = y + 1 | 0;
						r = L
					}
					while (1) {
						if ((y | 0) >= (x | 0)) break;
						z = z + +g[Ta + (y << 2) >> 2] * +g[Ha + (y << 2) >> 2];
						y = y + 1 | 0
					}
					C = z / r;
					y = va;
					v = 0;
					while (1) {
						if ((v | 0) >= (x | 0)) break;
						B = +g[Ha + (v << 2) >> 2] + .10000000149011612;
						r = C - +g[Ta + (v << 2) >> 2];
						w = 0;
						z = 0.0;
						while (1) {
							if ((w | 0) == 5) break;
							L = +g[y + (w << 2) >> 2];
							L = L > .10000000149011612 ? L : .10000000149011612;
							g[Ka + (w << 2) >> 2] = L;
							w = w + 1 | 0;
							z = z + L
						}
						z = .10000000149011612 / B * r / z;
						w = 0;
						while (1) {
							if ((w | 0) == 5) break;
							pa = y + (w << 2) | 0;
							g[pa >> 2] = +g[pa >> 2] + +g[Ka + (w << 2) >> 2] * z;
							w = w + 1 | 0
						}
						y = y + 20 | 0;
						v = v + 1 | 0
					}
					ta = f + 4800 | 0;
					v = c[f + 4684 >> 2] | 0;
					u = c[f + 4680 >> 2] | 0;
					ua = c[Ga >> 2] | 0;
					va = ua * 5 | 0;
					x = 0;
					while (1) {
						if ((x | 0) >= (va | 0)) break;
						z = +g[cb + 144 + (x << 2) >> 2] * 16384.0;
						y = (g[k >> 2] = z, c[k >> 2] | 0);
						if ((y & 2130706432) >>> 0 <= 1249902592) {
							y = (y | 0) < 0;
							z = y ? z + -8388608.0 + 8388608.0 : z + 8388608.0 + -8388608.0;
							if (z == 0.0) z = y ? -0.0 : 0.0
						}
						b[Ua + (x << 1) >> 1] = ~~z;
						x = x + 1 | 0
					}
					ra = f + 4772 | 0;
					sa = f + 4688 | 0;
					x = ua * 25 | 0;
					w = 0;
					while (1) {
						if ((w | 0) >= (x | 0)) break;
						z = +g[Ia + (w << 2) >> 2] * 262144.0;
						y = (g[k >> 2] = z, c[k >> 2] | 0);
						if ((y & 2130706432) >>> 0 <= 1249902592) {
							y = (y | 0) < 0;
							z = y ? z + -8388608.0 + 8388608.0 : z + 8388608.0 + -8388608.0;
							if (z == 0.0) z = y ? -0.0 : 0.0
						}
						c[Pa + (w << 2) >> 2] = ~~z;
						w = w + 1 | 0
					}
					pa = Ua;
					qa = Pa;
					oa = v << 16 >> 16;
					ma = (u | 0) != 0;
					t = 0;
					x = 0;
					y = 2147483647;
					na = 0;
					while (1) {
						if ((na | 0) >= 3) break;
						ha = c[23088 + (na << 2) >> 2] | 0;
						ia = a[32802 + na >> 0] | 0;
						ja = c[23100 + (na << 2) >> 2] | 0;
						ka = c[23076 + (na << 2) >> 2] | 0;
						G = qa;
						F = pa;
						ga = x;
						J = 0;
						Q = 0;
						la = c[sa >> 2] | 0;
						while (1) {
							if ((Q | 0) >= (ua | 0)) break;
							H = (Xb(5333 - la + 896 | 0) | 0) + -51 | 0;
							I = Va + Q | 0;
							q = F + 2 | 0;
							A = F + 4 | 0;
							p = F + 6 | 0;
							E = F + 8 | 0;
							ba = G + 4 | 0;
							$ = G + 8 | 0;
							Z = G + 12 | 0;
							Y = G + 16 | 0;
							W = G + 28 | 0;
							x = G + 32 | 0;
							w = G + 36 | 0;
							V = G + 24 | 0;
							v = G + 52 | 0;
							U = G + 56 | 0;
							u = G + 48 | 0;
							T = G + 76 | 0;
							S = G + 72 | 0;
							s = G + 96 | 0;
							da = ha;
							R = ga;
							ga = 2147483647;
							ca = 0;
							while (1) {
								if ((ca | 0) >= (ia | 0)) break;
								fa = d[ja + ca >> 0] | 0;
								nb = _(oa, d[ka + ca >> 0] | 0) | 0;
								qb = c[ba >> 2] | 0;
								Fa = (e[q >> 1] | 0) - (a[da + 1 >> 0] << 7) << 16 >> 16;
								qb = (_(qb >> 16, Fa) | 0) + ((_(qb & 65535, Fa) | 0) >> 16) | 0;
								rb = c[$ >> 2] | 0;
								Ia = (e[A >> 1] | 0) - (a[da + 2 >> 0] << 7) << 16 >> 16;
								rb = qb + ((_(rb >> 16, Ia) | 0) + ((_(rb & 65535, Ia) | 0) >> 16)) | 0;
								qb = c[Z >> 2] | 0;
								Ha = (e[p >> 1] | 0) - (a[da + 3 >> 0] << 7) << 16 >> 16;
								qb = rb + ((_(qb >> 16, Ha) | 0) + ((_(qb & 65535, Ha) | 0) >> 16)) | 0;
								rb = c[Y >> 2] | 0;
								ea = (e[E >> 1] | 0) - (a[da + 4 >> 0] << 7) << 16 >> 16;
								rb = qb + ((_(rb >> 16, ea) | 0) + ((_(rb & 65535, ea) | 0) >> 16)) << 1;
								qb = c[G >> 2] | 0;
								pb = (e[F >> 1] | 0) - (a[da >> 0] << 7) << 16 >> 16;
								qb = rb + ((_(qb >> 16, pb) | 0) + ((_(qb & 65535, pb) | 0) >> 16)) | 0;
								pb = nb + (((fa | 0) > (H | 0) ? fa - H | 0 : 0) << 10) + ((_(qb >> 16, pb) | 0) + ((_(qb & 65535, pb) | 0) >> 16)) | 0;
								qb = c[W >> 2] | 0;
								qb = (_(qb >> 16, Ia) | 0) + ((_(qb & 65535, Ia) | 0) >> 16) | 0;
								nb = c[x >> 2] | 0;
								nb = qb + ((_(nb >> 16, Ha) | 0) + ((_(nb & 65535, Ha) | 0) >> 16)) | 0;
								qb = c[w >> 2] | 0;
								qb = nb + ((_(qb >> 16, ea) | 0) + ((_(qb & 65535, ea) | 0) >> 16)) << 1;
								nb = c[V >> 2] | 0;
								nb = qb + ((_(nb >> 16, Fa) | 0) + ((_(nb & 65535, Fa) | 0) >> 16)) | 0;
								Fa = pb + ((_(nb >> 16, Fa) | 0) + ((_(nb & 65535, Fa) | 0) >> 16)) | 0;
								nb = c[v >> 2] | 0;
								nb = (_(nb >> 16, Ha) | 0) + ((_(nb & 65535, Ha) | 0) >> 16) | 0;
								pb = c[U >> 2] | 0;
								pb = nb + ((_(pb >> 16, ea) | 0) + ((_(pb & 65535, ea) | 0) >> 16)) << 1;
								nb = c[u >> 2] | 0;
								nb = pb + ((_(nb >> 16, Ia) | 0) + ((_(nb & 65535, Ia) | 0) >> 16)) | 0;
								Ia = Fa + ((_(nb >> 16, Ia) | 0) + ((_(nb & 65535, Ia) | 0) >> 16)) | 0;
								nb = c[T >> 2] | 0;
								nb = (_(nb >> 16, ea) | 0) + ((_(nb & 65535, ea) | 0) >> 16) << 1;
								Fa = c[S >> 2] | 0;
								Fa = nb + ((_(Fa >> 16, Ha) | 0) + ((_(Fa & 65535, Ha) | 0) >> 16)) | 0;
								Ha = Ia + ((_(Fa >> 16, Ha) | 0) + ((_(Fa & 65535, Ha) | 0) >> 16)) | 0;
								Fa = c[s >> 2] | 0;
								Fa = (_(Fa >> 16, ea) | 0) + ((_(Fa & 65535, ea) | 0) >> 16) | 0;
								ea = Ha + ((_(Fa >> 16, ea) | 0) + ((_(Fa & 65535, ea) | 0) >> 16)) | 0;
								if ((ea | 0) < (ga | 0)) {
									a[I >> 0] = ca;
									ga = ea
								} else fa = R;
								da = da + 5 | 0;
								R = fa;
								ca = ca + 1 | 0
							}
							Ia = J + ga | 0;
							nb = la + (Wb(R + 51 | 0) | 0) | 0;
							G = G + 100 | 0;
							F = F + 10 | 0;
							ga = R;
							J = (Ia | 0) < 0 ? 2147483647 : Ia;
							Q = Q + 1 | 0;
							la = (nb | 0) < 896 ? 0 : nb + -896 | 0
						}
						x = (J | 0) == 2147483647 ? 2147483646 : J;
						if ((x | 0) < (y | 0)) {
							a[ta >> 0] = na;
							nd(ra | 0, Va | 0, ua | 0) | 0;
							t = la;
							y = x
						}
						if (ma & (x | 0) < 12304) break;
						x = ga;
						na = na + 1 | 0
					}
					y = c[23088 + (a[ta >> 0] << 2) >> 2] | 0;
					v = 0;
					while (1) {
						if ((v | 0) >= (ua | 0)) break;
						x = f + 4772 + v | 0;
						w = v * 5 | 0;
						u = 0;
						while (1) {
							if ((u | 0) == 5) break;
							b[Ua + (w + u << 1) >> 1] = a[y + (((a[x >> 0] | 0) * 5 | 0) + u) >> 0] << 7;
							u = u + 1 | 0
						}
						v = v + 1 | 0
					}
					c[sa >> 2] = t;
					x = 0;
					while (1) {
						if ((x | 0) >= (va | 0)) break;
						g[cb + 144 + (x << 2) >> 2] = +(b[Ua + (x << 1) >> 1] | 0) * .00006103515625;
						x = x + 1 | 0
					}
					if (!m) {
						r = +((c[f + 4640 >> 2] | 0) + (c[f + 5776 >> 2] | 0) | 0) * +g[xa >> 2] * .10000000149011612;
						if (!(r > 2.0)) {
							if (r < 0.0) r = 0.0
						} else r = 2.0;
						v = ~~r;
						a[f + 4801 >> 0] = v
					} else {
						a[f + 4801 >> 0] = 0;
						v = 0
					}
					g[cb + 224 >> 2] = +(b[30752 + (v << 24 >> 24 << 1) >> 1] | 0) * .00006103515625;
					t = c[f + 4664 >> 2] | 0;
					s = c[Ba >> 2] | 0;
					q = c[Ga >> 2] | 0;
					A = s + t | 0;
					w = Qa;
					p = 0;
					t = f + 9356 + (Ja - t << 2) | 0;
					while (1) {
						if ((p | 0) >= (q | 0)) break;
						v = 0 - (c[cb + 228 + (p << 2) >> 2] | 0) | 0;
						B = +g[La + (p << 2) >> 2];
						y = p * 5 | 0;
						x = 0;
						while (1) {
							if ((x | 0) == 5) break;
							c[Ka + (x << 2) >> 2] = c[cb + 144 + (y + x << 2) >> 2];
							x = x + 1 | 0
						}
						u = 0;
						v = t + (v << 2) | 0;
						while (1) {
							if ((u | 0) >= (A | 0)) break;
							x = c[t + (u << 2) >> 2] | 0;
							y = w + (u << 2) | 0;
							c[y >> 2] = x;
							z = (c[k >> 2] = x, +g[k >> 2]);
							x = 0;
							while (1) {
								if ((x | 0) == 5) break;
								L = z - +g[Ka + (x << 2) >> 2] * +g[v + (2 - x << 2) >> 2];
								g[y >> 2] = L;
								z = L;
								x = x + 1 | 0
							}
							g[y >> 2] = z * B;
							u = u + 1 | 0;
							v = v + 4 | 0
						}
						w = w + (A << 2) | 0;
						p = p + 1 | 0;
						t = t + (s << 2) | 0
					}
				} else {
					A = f + 4664 | 0;
					s = c[A >> 2] | 0;
					w = s;
					q = 0;
					y = Qa;
					s = f + 9356 + (Ja - s << 2) | 0;
					while (1) {
						if ((q | 0) >= (x | 0)) break;
						z = +g[La + (q << 2) >> 2];
						x = c[Ba >> 2] | 0;
						u = x + w | 0;
						v = u & 65532;
						t = y;
						x = w + x & 65532;
						y = 0;
						while (1) {
							if ((y | 0) >= (v | 0)) break;
							g[t + (y << 2) >> 2] = z * +g[s + (y << 2) >> 2];
							nb = y | 1;
							g[t + (nb << 2) >> 2] = z * +g[s + (nb << 2) >> 2];
							nb = y | 2;
							g[t + (nb << 2) >> 2] = z * +g[s + (nb << 2) >> 2];
							nb = y | 3;
							g[t + (nb << 2) >> 2] = z * +g[s + (nb << 2) >> 2];
							y = y + 4 | 0
						}
						while (1) {
							if ((x | 0) >= (u | 0)) break;
							g[t + (x << 2) >> 2] = z * +g[s + (x << 2) >> 2];
							x = x + 1 | 0
						}
						nb = c[Ba >> 2] | 0;
						y = c[A >> 2] | 0;
						x = c[Ga >> 2] | 0;
						w = y;
						q = q + 1 | 0;
						y = t + (nb + y << 2) | 0;
						s = s + (nb << 2) | 0
					}
					id(cb + 144 | 0, 0, x * 20 | 0) | 0;
					g[cb + 872 >> 2] = 0.0;
					c[f + 4688 >> 2] = 0
				}
				if (!(c[f + 4696 >> 2] | 0)) {
					z = +ed(+g[cb + 872 >> 2] / 3.0) / 1.0e4;
					z = z / (+g[cb + 860 >> 2] * .75 + .25)
				} else z = .009999999776482582;
				G = f + 4664 | 0;
				p = c[G >> 2] | 0;
				s = (c[Ba >> 2] | 0) + p | 0;
				E = f + 4799 | 0;
				a[E >> 0] = 4;
				q = f + 4604 | 0;
				F = f + 4664 | 0;
				r = +vc(Na, Qa, z, s, c[q >> 2] | 0, p);
				p = f + 4656 | 0;
				j: do
					if (((c[p >> 2] | 0) != 0 ? (c[f + 4696 >> 2] | 0) == 0 : 0) ? (c[q >> 2] | 0) == 4 : 0) {
						A = s << 1;
						L = r - +vc(Ma, Qa + (A << 2) | 0, z, s, 2, c[F >> 2] | 0);
						y = (g[k >> 2] = L, c[k >> 2] | 0);
						tc(Ra, Ma, c[F >> 2] | 0);
						u = 2139095039;
						t = 3;
						while (1) {
							if ((t | 0) <= -1) break j;
							x = c[F >> 2] | 0;
							w = t << 16 >> 16;
							v = 0;
							while (1) {
								if ((v | 0) >= (x | 0)) break;
								nb = e[f + 4524 + (v << 1) >> 1] | 0;
								b[Ta + (v << 1) >> 1] = nb + ((_((e[Ra + (v << 1) >> 1] | 0) - nb << 16 >> 16, w) | 0) >>> 2);
								v = v + 1 | 0
							}
							x = c[F >> 2] | 0;
							Zb(Pa, Ta, x);
							w = 0;
							while (1) {
								if ((w | 0) >= (x | 0)) break;
								g[Ma + (w << 2) >> 2] = +(b[Pa + (w << 1) >> 1] | 0) * .000244140625;
								w = w + 1 | 0
							}
							sc(Oa, Ma, Qa, A, c[F >> 2] | 0);
							nb = c[F >> 2] | 0;
							x = s - nb | 0;
							z = +wc(Oa + (nb << 2) | 0, x);
							z = z + +wc(Oa + (nb + s << 2) | 0, x);
							x = (g[k >> 2] = z, c[k >> 2] | 0);
							if (!(z < (c[k >> 2] = y, +g[k >> 2]))) {
								if (z > (c[k >> 2] = u, +g[k >> 2])) break j
							} else {
								a[E >> 0] = t;
								y = x
							}
							u = x;
							t = t + -1 | 0
						}
					}
				while (0);
				if ((a[E >> 0] | 0) == 4) tc(Ra, Na, c[F >> 2] | 0);
				y = c[ya >> 2] << 16 >> 16;
				y = (_(y, -5) | 0) + (y * 59246 >> 16) + 3146 | 0;
				y = (c[q >> 2] | 0) == 2 ? y + (y >> 1) | 0 : y;
				ac(Ta, Ra, c[F >> 2] | 0);
				k: do
					if ((c[p >> 2] | 0) == 1) {
						t = a[E >> 0] | 0;
						nb = t << 24 >> 24 < 4;
						u = nb & 1;
						if (nb) {
							x = t << 24 >> 24;
							w = c[F >> 2] | 0;
							v = 0;
							while (1) {
								if ((v | 0) >= (w | 0)) break;
								nb = e[f + 4524 + (v << 1) >> 1] | 0;
								b[Pa + (v << 1) >> 1] = nb + ((_((e[Ra + (v << 1) >> 1] | 0) - nb << 16 >> 16, x) | 0) >>> 2);
								v = v + 1 | 0
							}
							ac(Va, Pa, c[F >> 2] | 0);
							v = a[E >> 0] | 0;
							v = (_(v, v) | 0) << 27 >> 16;
							w = 0;
							while (1) {
								if ((w | 0) >= (c[F >> 2] | 0)) break k;
								nb = Ta + (w << 1) | 0;
								Oa = b[Va + (w << 1) >> 1] | 0;
								b[nb >> 1] = ((b[nb >> 1] | 0) >>> 1) + ((_(Oa << 16 >> 16 >> 16, v) | 0) + ((_(Oa & 65535, v) | 0) >>> 16));
								w = w + 1 | 0
							}
						}
					} else u = 0;
				while (0);
				Mb(f + 4776 | 0, Ra, c[f + 4724 >> 2] | 0, Ta, y, c[f + 4692 >> 2] | 0, a[f + 4797 >> 0] | 0);
				Zb(Ua + 32 | 0, Ra, c[F >> 2] | 0);
				if (!u) nd(Ua | 0, Ua + 32 | 0, c[F >> 2] << 1 | 0) | 0;
				else {
					t = a[E >> 0] | 0;
					s = c[F >> 2] | 0;
					u = 0;
					while (1) {
						if ((u | 0) >= (s | 0)) break;
						nb = e[f + 4524 + (u << 1) >> 1] | 0;
						b[Pa + (u << 1) >> 1] = nb + ((_((e[Ra + (u << 1) >> 1] | 0) - nb << 16 >> 16, t) | 0) >>> 2);
						u = u + 1 | 0
					}
					Zb(Ua, Pa, c[F >> 2] | 0)
				}
				q = 0;
				while (1) {
					if ((q | 0) == 2) break;
					else p = 0;
					while (1) {
						if ((p | 0) >= (c[F >> 2] | 0)) break;
						g[cb + 16 + (q << 6) + (p << 2) >> 2] = +(b[Ua + (q << 5) + (p << 1) >> 1] | 0) * .000244140625;
						p = p + 1 | 0
					}
					q = q + 1 | 0
				}
				u = c[Ba >> 2] | 0;
				nb = c[Ga >> 2] | 0;
				q = c[G >> 2] | 0;
				p = Va + (q << 2) | 0;
				t = q + u | 0;
				s = t << 1;
				sc(Va, cb + 16 | 0, Qa, s, q);
				L = +g[cb >> 2];
				g[cb + 876 >> 2] = L * L * +wc(p, u);
				L = +g[cb + 4 >> 2];
				t = Va + (q + t << 2) | 0;
				g[cb + 880 >> 2] = L * L * +wc(t, u);
				if ((nb | 0) == 4) {
					sc(Va, cb + 80 | 0, Qa + (s << 2) | 0, s, q);
					L = +g[cb + 8 >> 2];
					g[cb + 884 >> 2] = L * L * +wc(p, u);
					L = +g[cb + 12 >> 2];
					g[cb + 888 >> 2] = L * L * +wc(t, u)
				}
				x = f + 4524 | 0;
				F = Ra;
				w = x + 32 | 0;
				do {
					b[x >> 1] = b[F >> 1] | 0;
					x = x + 2 | 0;
					F = F + 2 | 0
				} while ((x | 0) < (w | 0));
				l: do
					if ((a[Wa >> 0] | 0) == 2) {
						r = 1.0 - 1.0 / (+X(+ -((+g[cb + 872 >> 2] + -12.0) * .25)) + 1.0) * .5;
						q = 0;
						while (1) {
							if ((q | 0) >= (c[Ga >> 2] | 0)) break l;
							nb = cb + (q << 2) | 0;
							g[nb >> 2] = +g[nb >> 2] * r;
							q = q + 1 | 0
						}
					}
				while (0);
				r = +ed((21.0 - +(c[za >> 2] | 0) * .0078125) * .33000001311302185);
				r = r / +(c[Ba >> 2] | 0);
				p = 0;
				while (1) {
					q = c[Ga >> 2] | 0;
					if ((p | 0) >= (q | 0)) {
						p = 0;
						break
					}
					nb = cb + (p << 2) | 0;
					L = +g[nb >> 2];
					L = +O(+(L * L + +g[cb + 876 + (p << 2) >> 2] * r));
					g[nb >> 2] = L < 32767.0 ? L : 32767.0;
					p = p + 1 | 0
				}
				while (1) {
					if ((p | 0) >= (q | 0)) break;
					c[Ua + (p << 2) >> 2] = ~~(+g[cb + (p << 2) >> 2] * 65536.0);
					q = c[Ga >> 2] | 0;
					p = p + 1 | 0
				}
				nd(cb + 892 | 0, Ua | 0, q << 2 | 0) | 0;
				q = f + 7200 | 0;
				na = cb + 908 | 0;
				a[na >> 0] = a[q >> 0] | 0;
				oa = f + 4768 | 0;
				pa = (m | 0) == 2;
				qa = pa & 1;
				Gb(oa, Ua, q, qa, c[Ga >> 2] | 0);
				q = 0;
				while (1) {
					if ((q | 0) >= (c[Ga >> 2] | 0)) break;
					g[cb + (q << 2) >> 2] = +(c[Ua + (q << 2) >> 2] | 0) * .0000152587890625;
					q = q + 1 | 0
				}
				u = a[Wa >> 0] | 0;
				do
					if (u << 24 >> 24 == 2) {
						q = f + 4798 | 0;
						if (+g[cb + 872 >> 2] + +(c[f + 4744 >> 2] | 0) * .000030517578125 > 1.0) {
							a[q >> 0] = 0;
							xa = q;
							t = 0;
							break
						} else {
							a[q >> 0] = 1;
							xa = q;
							t = 1;
							break
						}
					} else {
						t = f + 4798 | 0;
						xa = t;
						t = a[t >> 0] | 0
					}
				while (0);
				va = cb + 852 | 0;
				g[va >> 2] = +(c[f + 4652 >> 2] | 0) * -.05000000074505806 + 1.2000000476837158 + +(c[ya >> 2] | 0) * -.20000000298023224 * .00390625 + +g[Aa >> 2] * -.10000000149011612 + +g[Ea >> 2] * -.20000000298023224 + +(b[30744 + (u << 24 >> 24 >> 1 << 2) + (t << 24 >> 24 << 1) >> 1] | 0) * .0009765625 * .800000011920929;
				H = f + 9352 | 0;
				G = f + 9264 | 0;
				Q = f + 9268 | 0;
				R = f + 9272 | 0;
				S = f + 9344 | 0;
				T = f + 9332 | 0;
				U = f + 9336 | 0;
				V = f + 9340 | 0;
				x = c[H >> 2] | 0;
				J = Sa;
				q = ib;
				I = 0;
				while (1) {
					y = c[Ga >> 2] | 0;
					if ((I | 0) >= (y | 0)) break;
					if ((a[Wa >> 0] | 0) == 2) x = c[cb + 228 + (I << 2) >> 2] | 0;
					F = cb + 804 + (I << 2) | 0;
					r = +g[cb + 836 + (I << 2) >> 2] * (1.0 - +g[F >> 2]);
					K = r * .25;
					L = +g[cb + 820 + (I << 2) >> 2];
					M = +g[cb + 756 + (I << 2) >> 2];
					P = +g[cb + 772 + (I << 2) >> 2];
					y = I << 4;
					w = cb + 244 + (y << 2) | 0;
					D = +(c[Da >> 2] | 0) * .0000152587890625;
					v = c[Ba >> 2] | 0;
					u = c[Ca >> 2] | 0;
					t = f + 9264 + (u << 2) | 0;
					s = cb + 244 + (y + (u + -1) << 2) | 0;
					p = 0;
					while (1) {
						if ((p | 0) >= (v | 0)) break;
						wa = +g[Q >> 2];
						C = +g[G >> 2] + D * wa;
						A = J + (p << 2) | 0;
						c[G >> 2] = c[A >> 2];
						mb = +g[R >> 2];
						g[Q >> 2] = C;
						B = mb;
						z = +g[w >> 2] * C;
						E = 2;
						C = wa + D * (mb - C);
						while (1) {
							if ((E | 0) >= (u | 0)) break;
							Sa = f + 9264 + ((E | 1) << 2) | 0;
							lb = +g[Sa >> 2];
							mb = B + D * (lb - C);
							g[f + 9264 + (E << 2) >> 2] = C;
							sb = z + +g[cb + 244 + (y + (E + -1) << 2) >> 2] * C;
							nb = E + 2 | 0;
							wa = +g[f + 9264 + (nb << 2) >> 2];
							g[Sa >> 2] = mb;
							B = wa;
							z = sb + +g[cb + 244 + (y + E << 2) >> 2] * mb;
							E = nb;
							C = lb + D * (wa - mb)
						}
						g[t >> 2] = C;
						g[Va + (p << 2) >> 2] = +g[A >> 2] - (z + +g[s >> 2] * C);
						p = p + 1 | 0
					}
					z = +g[cb + 788 + (I << 2) >> 2];
					B = -(z * (+g[F >> 2] * r + .05000000074505806 + +g[Ea >> 2] * .10000000149011612));
					g[q >> 2] = z * +g[Va >> 2] + +g[S >> 2] * B;
					y = 1;
					while (1) {
						w = c[Ba >> 2] | 0;
						if ((y | 0) >= (w | 0)) break;
						g[q + (y << 2) >> 2] = z * +g[Va + (y << 2) >> 2] + +g[Va + (y + -1 << 2) >> 2] * B;
						y = y + 1 | 0
					}
					z = r * .4999847412109375;
					c[S >> 2] = c[Va + (w + -1 << 2) >> 2];
					y = c[Ba >> 2] | 0;
					w = (x | 0) > 0;
					v = c[T >> 2] | 0;
					u = c[U >> 2] | 0;
					t = c[V >> 2] | 0;
					s = 0;
					while (1) {
						if ((s | 0) >= (y | 0)) break;
						if (w) {
							nb = x + v | 0;
							B = +g[f + 7216 + ((nb + 510 & 511) << 2) >> 2] * K + +g[f + 7216 + ((nb + 511 & 511) << 2) >> 2] * z + +g[f + 7216 + ((nb & 511) << 2) >> 2] * K
						} else B = 0.0;
						mb = (c[k >> 2] = u, +g[k >> 2]);
						D = mb * P + (c[k >> 2] = t, +g[k >> 2]) * M;
						Qa = q + (s << 2) | 0;
						mb = +g[Qa >> 2] - mb * L;
						Sa = (g[k >> 2] = mb, c[k >> 2] | 0);
						D = mb - D;
						nb = (g[k >> 2] = D, c[k >> 2] | 0);
						Ra = v + 511 & 511;
						g[f + 7216 + (Ra << 2) >> 2] = D;
						g[Qa >> 2] = D - B;
						v = Ra;
						u = Sa;
						t = nb;
						s = s + 1 | 0
					}
					c[U >> 2] = u;
					c[V >> 2] = t;
					c[T >> 2] = v;
					nb = c[Ba >> 2] | 0;
					J = J + (nb << 2) | 0;
					q = q + (nb << 2) | 0;
					I = I + 1 | 0
				}
				c[H >> 2] = c[cb + 228 + (y + -1 << 2) >> 2];
				ma = f + 5780 | 0;
				y = c[ma >> 2] | 0;
				A = f + 6132 + (y * 36 | 0) | 0;
				do
					if (c[f + 6124 >> 2] | 0) {
						if ((c[ya >> 2] | 0) <= 77) break;
						c[f + 4756 + (y << 2) >> 2] = 1;
						nd(Va | 0, f + 144 | 0, 4380) | 0;
						x = A;
						F = oa;
						w = x + 36 | 0;
						do {
							b[x >> 1] = b[F >> 1] | 0;
							x = x + 2 | 0;
							F = F + 2 | 0
						} while ((x | 0) < (w | 0));
						nd(Ta | 0, cb | 0, c[Ga >> 2] << 2 | 0) | 0;
						q = c[ma >> 2] | 0;
						do
							if (!q) jb = 590;
							else {
								if (!(c[f + 4756 + (q + -1 << 2) >> 2] | 0)) {
									jb = 590;
									break
								}
								p = A;
								v = f + 4564 | 0
							}
						while (0);
						if ((jb | 0) == 590) {
							v = f + 4564 | 0;
							a[v >> 0] = a[f + 7200 >> 0] | 0;
							p = (d[A >> 0] | 0) + (c[f + 6128 >> 2] | 0) | 0;
							nb = p & 255;
							a[A >> 0] = nb;
							a[A >> 0] = nb << 24 >> 24 < 63 ? p << 24 >> 24 : 63;
							p = A
						}
						w = c[Ga >> 2] | 0;
						x = 0;
						while (1) {
							if ((x | 0) >= (w | 0)) {
								q = 0;
								break
							}
							do
								if ((x | 0) == 0 ^ 1 | pa) {
									u = (a[f + 6132 + (y * 36 | 0) + x >> 0] | 0) + -4 | 0;
									t = a[v >> 0] | 0;
									s = (t << 24 >> 24) + 8 | 0;
									if ((u | 0) > (s | 0)) {
										q = (t & 255) + ((u << 1) - s) & 255;
										a[v >> 0] = q;
										break
									} else {
										q = (t & 255) + u & 255;
										a[v >> 0] = q;
										break
									}
								} else {
									nb = a[p >> 0] | 0;
									q = (a[v >> 0] | 0) + -16 | 0;
									q = ((nb | 0) > (q | 0) ? nb : q) & 255;
									a[v >> 0] = q
								}
							while (0);
							if (q << 24 >> 24 > 63) q = 63;
							else q = q << 24 >> 24 < 0 ? 0 : q << 24 >> 24;
							a[v >> 0] = q;
							nb = (q * 29 | 0) + (q * 7281 >> 16) + 2090 | 0;
							c[Ua + (x << 2) >> 2] = Xb((nb | 0) < 3967 ? nb : 3967) | 0;
							x = x + 1 | 0
						}
						while (1) {
							if ((q | 0) >= (c[Ga >> 2] | 0)) break;
							g[cb + (q << 2) >> 2] = +(c[Ua + (q << 2) >> 2] | 0) * .0000152587890625;
							q = q + 1 | 0
						}
						uc(f, cb, A, Va, f + 6240 + ((c[ma >> 2] | 0) * 320 | 0) | 0, ib);
						nd(cb | 0, Ta | 0, c[Ga >> 2] << 2 | 0) | 0
					}
				while (0);
				p = c[Ga >> 2] | 0;
				y = 0;
				q = 0;
				while (1) {
					if ((q | 0) >= (p | 0)) break;
					y = (a[f + 4768 + q >> 0] | 0) + (y << 8) | 0;
					q = q + 1 | 0
				}
				x = fb;
				F = l;
				w = x + 48 | 0;
				do {
					c[x >> 2] = c[F >> 2];
					x = x + 4 | 0;
					F = F + 4 | 0
				} while ((x | 0) < (w | 0));
				S = f + 144 | 0;
				nd(db | 0, S | 0, 4380) | 0;
				T = a[_a >> 0] | 0;
				U = f + 5804 | 0;
				V = b[U >> 1] | 0;
				W = f + 5800 | 0;
				Y = c[W >> 2] | 0;
				Z = f + 7200 | 0;
				$ = n + -5 | 0;
				ba = l + 24 | 0;
				ca = l + 28 | 0;
				da = f + 4768 | 0;
				ea = f + 4804 | 0;
				fa = l + 20 | 0;
				ga = l + 28 | 0;
				R = (o | 0) == 0;
				H = 0;
				t = 0;
				I = 0;
				J = 256;
				G = 0;
				u = 0;
				E = -1;
				A = -1;
				p = 0;
				q = 0;
				s = 0;
				Q = 0;
				while (1) {
					v = (y | 0) == (E | 0);
					do
						if (!v) {
							if ((y | 0) == (A | 0)) {
								x = q;
								jb = 614;
								break
							}
							if ((Q | 0) > 0) {
								x = l;
								F = fb;
								w = x + 48 | 0;
								do {
									c[x >> 2] = c[F >> 2];
									x = x + 4 | 0;
									F = F + 4 | 0
								} while ((x | 0) < (w | 0));
								nd(S | 0, db | 0, 4380) | 0;
								a[_a >> 0] = T;
								b[U >> 1] = V;
								c[W >> 2] = Y
							}
							uc(f, cb, da, S, ea, ib);
							Eb(f, l, c[ma >> 2] | 0, 0, m);
							Fb(l, a[Wa >> 0] | 0, a[xa >> 0] | 0, ea, c[Za >> 2] | 0);
							x = (c[fa >> 2] | 0) + ((aa(c[ga >> 2] | 0) | 0) + -32) | 0;
							if (!(R & (Q | 0) == 0)) {
								jb = 614;
								break
							}
							if ((x | 0) <= (n | 0)) break c
						} else {
							x = p;
							jb = 614
						}
					while (0);
					if ((jb | 0) == 614) {
						jb = 0;
						if ((Q | 0) == 6) break
					}
					F = (x | 0) > (n | 0);
					do
						if (F)
							if ((t | 0) == 0 & (Q | 0) > 1) {
								g[va >> 2] = +g[va >> 2] * 1.5;
								I = 0;
								A = -1;
								break
							} else {
								I = 1;
								u = J << 16 >> 16;
								A = y;
								q = x;
								break
							}
					else {
						if ((x | 0) >= ($ | 0)) break c;
						w = J << 16 >> 16;
						if (v) {
							t = 1;
							G = w;
							E = y;
							p = x;
							break
						};
						c[gb >> 2] = c[l >> 2];
						c[gb + 4 >> 2] = c[l + 4 >> 2];
						c[gb + 8 >> 2] = c[l + 8 >> 2];
						c[gb + 12 >> 2] = c[l + 12 >> 2];
						c[gb + 16 >> 2] = c[l + 16 >> 2];
						c[gb + 20 >> 2] = c[l + 20 >> 2];
						s = c[ba >> 2] | 0;
						c[hb >> 2] = c[ca >> 2];
						c[hb + 4 >> 2] = c[ca + 4 >> 2];
						c[hb + 8 >> 2] = c[ca + 8 >> 2];
						c[hb + 12 >> 2] = c[ca + 12 >> 2];
						c[hb + 16 >> 2] = c[ca + 16 >> 2];
						nd(ab | 0, c[l >> 2] | 0, s | 0) | 0;
						nd(eb | 0, S | 0, 4380) | 0;
						H = a[Z >> 0] | 0;
						t = 1;
						G = w;
						E = y;
						p = x
					} while (0);
					do
						if (!(t & I)) {
							nb = Xb(((x - n << 7 | 0) / (c[Za >> 2] | 0) | 0) + 2048 | 0) | 0;
							nb = (nb | 0) < 131072 ? nb : 131072;
							nb = F ^ 1 | (nb | 0) > 85197 ? nb : 85197;
							y = J << 16 >> 16;
							y = (_(nb >> 16, y) | 0) + ((_(nb & 65535, y) | 0) >>> 16) | 0
						} else {
							x = u - G | 0;
							y = G + ((_(x, n - p | 0) | 0) / (q - p | 0) | 0) | 0;
							w = x >> 2;
							if ((y << 16 >> 16 | 0) > (G + w | 0)) {
								y = G + (x >>> 2) | 0;
								break
							}
							if ((y << 16 >> 16 | 0) >= (u - w | 0)) break;
							y = u - (x >>> 2) | 0
						}
					while (0);
					v = y & 65535;
					y = y << 16 >> 16;
					w = 0;
					while (1) {
						x = c[Ga >> 2] | 0;
						if ((w | 0) >= (x | 0)) break;
						nb = c[cb + 892 + (w << 2) >> 2] | 0;
						nb = (_(nb >> 16, y) | 0) + ((_(nb & 65535, y) | 0) >> 16) | 0;
						c[bb + (w << 2) >> 2] = ((nb | 0) > 8388607 ? 8388607 : (nb | 0) < -8388608 ? -8388608 : nb) << 8;
						w = w + 1 | 0
					}
					a[Z >> 0] = a[na >> 0] | 0;
					Gb(oa, bb, Z, qa, x);
					x = c[Ga >> 2] | 0;
					y = 0;
					w = 0;
					while (1) {
						if ((w | 0) >= (x | 0)) {
							w = 0;
							break
						}
						y = (a[f + 4768 + w >> 0] | 0) + (y << 8) | 0;
						w = w + 1 | 0
					}
					while (1) {
						if ((w | 0) >= (x | 0)) break;
						g[cb + (w << 2) >> 2] = +(c[bb + (w << 2) >> 2] | 0) * .0000152587890625;
						x = c[Ga >> 2] | 0;
						w = w + 1 | 0
					}
					J = v;
					Q = Q + 1 | 0
				}
				if ((t | 0) != 0 & (v | (x | 0) > (n | 0))) {
					c[l >> 2] = c[gb >> 2];
					c[l + 4 >> 2] = c[gb + 4 >> 2];
					c[l + 8 >> 2] = c[gb + 8 >> 2];
					c[l + 12 >> 2] = c[gb + 12 >> 2];
					c[l + 16 >> 2] = c[gb + 16 >> 2];
					c[l + 20 >> 2] = c[gb + 20 >> 2];
					c[ba >> 2] = s;
					c[ca >> 2] = c[hb >> 2];
					c[ca + 4 >> 2] = c[hb + 4 >> 2];
					c[ca + 8 >> 2] = c[hb + 8 >> 2];
					c[ca + 12 >> 2] = c[hb + 12 >> 2];
					c[ca + 16 >> 2] = c[hb + 16 >> 2];
					nd(c[l >> 2] | 0, ab | 0, s | 0) | 0;
					nd(S | 0, eb | 0, 4380) | 0;
					a[Z >> 0] = H
				}
			}
		while (0);
		od(f + 9356 | 0, f + 9356 + (c[Za >> 2] << 2) | 0, (c[$a >> 2] | 0) + ((c[Ya >> 2] | 0) * 5 | 0) << 2 | 0) | 0;
		if (c[Xa >> 2] | 0) {
			nb = 0;
			c[j >> 2] = nb;
			i = kb;
			return 0
		}
		c[f + 4568 >> 2] = c[cb + 228 + ((c[f + 4604 >> 2] | 0) + -1 << 2) >> 2];
		a[f + 4565 >> 0] = a[f + 4797 >> 0] | 0;
		c[f + 4696 >> 2] = 0;
		nb = (c[l + 20 >> 2] | 0) + ((aa(c[l + 28 >> 2] | 0) | 0) + -32) + 7 >> 3;
		c[j >> 2] = nb;
		i = kb;
		return 0
	}

	function sc(a, b, c, d, e) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
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
			v = 0;
		switch (e | 0) {
			case 6:
				{
					f = b + 4 | 0;h = b + 8 | 0;i = b + 12 | 0;j = b + 16 | 0;k = b + 20 | 0;l = 6;
					while (1) {
						if ((l | 0) >= (d | 0)) break;
						g[a + (l << 2) >> 2] = +g[c + (l << 2) >> 2] - (+g[c + (l + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (l + -2 << 2) >> 2] * +g[f >> 2] + +g[c + (l + -3 << 2) >> 2] * +g[h >> 2] + +g[c + (l + -4 << 2) >> 2] * +g[i >> 2] + +g[c + (l + -5 << 2) >> 2] * +g[j >> 2] + +g[c + (l + -6 << 2) >> 2] * +g[k >> 2]);
						l = l + 1 | 0
					}
					p = e << 2;id(a | 0, 0, p | 0) | 0;
					return
				}
			case 8:
				{
					l = b + 4 | 0;k = b + 8 | 0;j = b + 12 | 0;i = b + 16 | 0;h = b + 20 | 0;f = b + 24 | 0;m = b + 28 | 0;n = 8;
					while (1) {
						if ((n | 0) >= (d | 0)) break;
						g[a + (n << 2) >> 2] = +g[c + (n << 2) >> 2] - (+g[c + (n + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (n + -2 << 2) >> 2] * +g[l >> 2] + +g[c + (n + -3 << 2) >> 2] * +g[k >> 2] + +g[c + (n + -4 << 2) >> 2] * +g[j >> 2] + +g[c + (n + -5 << 2) >> 2] * +g[i >> 2] + +g[c + (n + -6 << 2) >> 2] * +g[h >> 2] + +g[c + (n + -7 << 2) >> 2] * +g[f >> 2] + +g[c + (n + -8 << 2) >> 2] * +g[m >> 2]);
						n = n + 1 | 0
					}
					p = e << 2;id(a | 0, 0, p | 0) | 0;
					return
				}
			case 10:
				{
					k = b + 4 | 0;j = b + 8 | 0;i = b + 12 | 0;h = b + 16 | 0;f = b + 20 | 0;o = b + 24 | 0;n = b + 28 | 0;m = b + 32 | 0;l = b + 36 | 0;p = 10;
					while (1) {
						if ((p | 0) >= (d | 0)) break;
						g[a + (p << 2) >> 2] = +g[c + (p << 2) >> 2] - (+g[c + (p + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (p + -2 << 2) >> 2] * +g[k >> 2] + +g[c + (p + -3 << 2) >> 2] * +g[j >> 2] + +g[c + (p + -4 << 2) >> 2] * +g[i >> 2] + +g[c + (p + -5 << 2) >> 2] * +g[h >> 2] + +g[c + (p + -6 << 2) >> 2] * +g[f >> 2] + +g[c + (p + -7 << 2) >> 2] * +g[o >> 2] + +g[c + (p + -8 << 2) >> 2] * +g[n >> 2] + +g[c + (p + -9 << 2) >> 2] * +g[m >> 2] + +g[c + (p + -10 << 2) >> 2] * +g[l >> 2]);
						p = p + 1 | 0
					}
					p = e << 2;id(a | 0, 0, p | 0) | 0;
					return
				}
			case 12:
				{
					p = b + 4 | 0;o = b + 8 | 0;n = b + 12 | 0;m = b + 16 | 0;l = b + 20 | 0;k = b + 24 | 0;j = b + 28 | 0;i = b + 32 | 0;h = b + 36 | 0;f = b + 40 | 0;q = b + 44 | 0;r = 12;
					while (1) {
						if ((r | 0) >= (d | 0)) break;
						g[a + (r << 2) >> 2] = +g[c + (r << 2) >> 2] - (+g[c + (r + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (r + -2 << 2) >> 2] * +g[p >> 2] + +g[c + (r + -3 << 2) >> 2] * +g[o >> 2] + +g[c + (r + -4 << 2) >> 2] * +g[n >> 2] + +g[c + (r + -5 << 2) >> 2] * +g[m >> 2] + +g[c + (r + -6 << 2) >> 2] * +g[l >> 2] + +g[c + (r + -7 << 2) >> 2] * +g[k >> 2] + +g[c + (r + -8 << 2) >> 2] * +g[j >> 2] + +g[c + (r + -9 << 2) >> 2] * +g[i >> 2] + +g[c + (r + -10 << 2) >> 2] * +g[h >> 2] + +g[c + (r + -11 << 2) >> 2] * +g[f >> 2] + +g[c + (r + -12 << 2) >> 2] * +g[q >> 2]);
						r = r + 1 | 0
					}
					p = e << 2;id(a | 0, 0, p | 0) | 0;
					return
				}
			case 16:
				{
					r = b + 4 | 0;q = b + 8 | 0;f = b + 12 | 0;h = b + 16 | 0;i = b + 20 | 0;j = b + 24 | 0;k = b + 28 | 0;l = b + 32 | 0;m = b + 36 | 0;n = b + 40 | 0;o = b + 44 | 0;p = b + 48 | 0;s = b + 52 | 0;t = b + 56 | 0;u = b + 60 | 0;v = 16;
					while (1) {
						if ((v | 0) >= (d | 0)) break;
						g[a + (v << 2) >> 2] = +g[c + (v << 2) >> 2] - (+g[c + (v + -1 << 2) >> 2] * +g[b >> 2] + +g[c + (v + -2 << 2) >> 2] * +g[r >> 2] + +g[c + (v + -3 << 2) >> 2] * +g[q >> 2] + +g[c + (v + -4 << 2) >> 2] * +g[f >> 2] + +g[c + (v + -5 << 2) >> 2] * +g[h >> 2] + +g[c + (v + -6 << 2) >> 2] * +g[i >> 2] + +g[c + (v + -7 << 2) >> 2] * +g[j >> 2] + +g[c + (v + -8 << 2) >> 2] * +g[k >> 2] + +g[c + (v + -9 << 2) >> 2] * +g[l >> 2] + +g[c + (v + -10 << 2) >> 2] * +g[m >> 2] + +g[c + (v + -11 << 2) >> 2] * +g[n >> 2] + +g[c + (v + -12 << 2) >> 2] * +g[o >> 2] + +g[c + (v + -13 << 2) >> 2] * +g[p >> 2] + +g[c + (v + -14 << 2) >> 2] * +g[s >> 2] + +g[c + (v + -15 << 2) >> 2] * +g[t >> 2] + +g[c + (v + -16 << 2) >> 2] * +g[u >> 2]);
						v = v + 1 | 0
					}
					p = e << 2;id(a | 0, 0, p | 0) | 0;
					return
				}
			default:
				{
					p = e << 2;id(a | 0, 0, p | 0) | 0;
					return
				}
		}
	}

	function tc(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0.0,
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
			D = 0;
		D = i;
		i = i + 144 | 0;
		y = D + 108 | 0;
		A = D + 72 | 0;
		z = D + 64 | 0;
		B = D;
		j = 0;
		while (1) {
			if ((j | 0) >= (e | 0)) break;
			h = +g[d + (j << 2) >> 2] * 65536.0;
			f = (g[k >> 2] = h, c[k >> 2] | 0);
			if ((f & 2130706432) >>> 0 <= 1249902592) {
				f = (f | 0) < 0;
				h = f ? h + -8388608.0 + 8388608.0 : h + 8388608.0 + -8388608.0;
				if (h == 0.0) h = f ? -0.0 : 0.0
			}
			c[B + (j << 2) >> 2] = ~~h;
			j = j + 1 | 0
		}
		c[z >> 2] = y;
		c[z + 4 >> 2] = A;
		w = e >> 1;
		Sb(B, y, A, w);
		x = y;
		f = Tb(y, 8192, w) | 0;
		if ((f | 0) < 0) {
			b[a >> 1] = 0;
			j = A;
			v = j;
			d = 1;
			f = Tb(A, 8192, w) | 0
		} else {
			v = A;
			j = x;
			d = 0
		}
		u = 0;
		a: while (1) {
			o = 1;
			m = 0;
			n = 8192;
			b: while (1) {
				s = j;
				t = o;
				l = m;
				p = n;
				while (1) {
					n = b[30758 + (t << 1) >> 1] | 0;
					o = Tb(s, n, w) | 0;
					if ((f | 0) < 1) {
						if ((o | 0) >= (l | 0)) break;
						if (!((f | 0) <= -1 | (o | 0) > (0 - l | 0))) break
					} else if ((o | 0) <= (0 - l | 0)) break;
					if ((t | 0) > 127) break b;
					else {
						t = t + 1 | 0;
						l = 0;
						p = n;
						f = o
					}
				}
				m = (o | 0) == 0 ? 1 : 0;
				j = -256;
				r = 0;
				while (1) {
					if ((r | 0) == 3) break;
					l = p + n | 0;
					l = (l >> 1) + (l & 1) | 0;
					q = Tb(s, l, w) | 0;
					if ((f | 0) < 1)
						if ((q | 0) > -1 | (f | 0) > -1) {
							n = l;
							o = q
						} else C = 22;
					else if ((q | 0) < 1) {
						n = l;
						o = q
					} else C = 22;
					if ((C | 0) == 22) {
						C = 0;
						j = j + (128 >>> r) | 0;
						p = l;
						f = q
					}
					r = r + 1 | 0
				}
				l = f - o | 0;
				if ((((f | 0) > 0 ? f : 0 - f | 0) | 0) < 65536) {
					if ((f | 0) != (o | 0)) j = j + (((f << 5) + (l >> 1) | 0) / (l | 0) | 0) | 0
				} else j = j + ((f | 0) / (l >> 5 | 0) | 0) | 0;
				l = (t << 8) + j | 0;
				b[a + (d << 1) >> 1] = (l | 0) < 32767 ? l : 32767;
				l = d + 1 | 0;
				if ((l | 0) >= (e | 0)) {
					C = 37;
					break a
				}
				o = t;
				j = c[z + ((l & 1) << 2) >> 2] | 0;
				d = l;
				n = b[30758 + (t + -1 << 1) >> 1] | 0;
				f = 1 - (l & 2) << 12
			}
			d = u + 1 | 0;
			if ((u | 0) > 29) break;
			f = d << 16;
			Vb(B, e, 65536 - (_(f + 655360 >> 16, f >> 16) | 0) | 0);
			Sb(B, y, A, w);
			f = Tb(y, 8192, w) | 0;
			if ((f | 0) >= 0) {
				u = d;
				j = x;
				d = 0;
				continue
			}
			b[a >> 1] = 0;
			u = d;
			j = v;
			d = 1;
			f = Tb(A, 8192, w) | 0
		}
		if ((C | 0) == 37) {
			i = D;
			return
		}
		b[a >> 1] = 32768 / (e + 1 | 0) | 0;
		f = 1;
		while (1) {
			if ((f | 0) >= (e | 0)) break;
			b[a + (f << 1) >> 1] = _((f << 16) + 65536 >> 16, b[a >> 1] | 0) | 0;
			f = f + 1 | 0
		}
		i = D;
		return
	}

	function uc(d, e, f, h, j, l) {
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		j = j | 0;
		l = l | 0;
		var m = 0.0,
			n = 0,
			o = 0.0,
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
			F = 0;
		F = i;
		i = i + 1584 | 0;
		E = F + 64 | 0;
		y = F + 48 | 0;
		C = F + 1512 | 0;
		B = F + 1472 | 0;
		x = F + 1344 | 0;
		A = F + 32 | 0;
		D = F + 16 | 0;
		z = F;
		w = c[d + 4604 >> 2] | 0;
		t = d + 4660 | 0;
		u = 0;
		while (1) {
			if ((u | 0) >= (w | 0)) {
				v = 0;
				break
			}
			s = c[t >> 2] | 0;
			q = u << 4;
			v = 0;
			while (1) {
				if ((v | 0) >= (s | 0)) break;
				n = q + v | 0;
				o = +g[e + 500 + (n << 2) >> 2] * 8192.0;
				p = (g[k >> 2] = o, c[k >> 2] | 0);
				if ((p & 2130706432) >>> 0 <= 1249902592) {
					r = (p | 0) < 0;
					o = r ? o + -8388608.0 + 8388608.0 : o + 8388608.0 + -8388608.0;
					if (o == 0.0) o = r ? -0.0 : 0.0
				}
				b[x + (n << 1) >> 1] = ~~o;
				v = v + 1 | 0
			}
			u = u + 1 | 0
		}
		while (1) {
			if ((v | 0) >= (w | 0)) break;
			m = +g[e + 772 + (v << 2) >> 2] * 16384.0;
			n = (g[k >> 2] = m, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			}
			p = ~~m << 16;
			m = +g[e + 756 + (v << 2) >> 2] * 16384.0;
			n = (g[k >> 2] = m, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			}
			c[A + (v << 2) >> 2] = p | ~~m & 65535;
			m = +g[e + 820 + (v << 2) >> 2] * 16384.0;
			n = (g[k >> 2] = m, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			}
			c[D + (v << 2) >> 2] = ~~m;
			m = +g[e + 836 + (v << 2) >> 2] * 16384.0;
			n = (g[k >> 2] = m, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			}
			c[z + (v << 2) >> 2] = ~~m;
			v = v + 1 | 0
		}
		m = +g[e + 852 >> 2] * 1024.0;
		n = (g[k >> 2] = m, c[k >> 2] | 0);
		if ((n & 2130706432) >>> 0 <= 1249902592) {
			n = (n | 0) < 0;
			m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
			if (m == 0.0) m = n ? -0.0 : 0.0
		}
		p = w * 5 | 0;
		q = 0;
		while (1) {
			if ((q | 0) >= (p | 0)) break;
			o = +g[e + 144 + (q << 2) >> 2] * 16384.0;
			n = (g[k >> 2] = o, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				o = n ? o + -8388608.0 + 8388608.0 : o + 8388608.0 + -8388608.0;
				if (o == 0.0) o = n ? -0.0 : 0.0
			}
			b[B + (q << 1) >> 1] = ~~o;
			q = q + 1 | 0
		}
		v = ~~m;
		r = d + 4664 | 0;
		s = 0;
		while (1) {
			if ((s | 0) == 2) {
				p = 0;
				break
			}
			q = c[r >> 2] | 0;
			t = 0;
			while (1) {
				if ((t | 0) >= (q | 0)) break;
				o = +g[e + 16 + (s << 6) + (t << 2) >> 2] * 4096.0;
				n = (g[k >> 2] = o, c[k >> 2] | 0);
				if ((n & 2130706432) >>> 0 <= 1249902592) {
					p = (n | 0) < 0;
					o = p ? o + -8388608.0 + 8388608.0 : o + 8388608.0 + -8388608.0;
					if (o == 0.0) o = p ? -0.0 : 0.0
				}
				b[C + (s << 5) + (t << 1) >> 1] = ~~o;
				t = t + 1 | 0
			}
			s = s + 1 | 0
		}
		while (1) {
			if ((p | 0) >= (w | 0)) break;
			m = +g[e + (p << 2) >> 2] * 65536.0;
			n = (g[k >> 2] = m, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			}
			c[y + (p << 2) >> 2] = ~~m;
			p = p + 1 | 0
		}
		if ((a[f + 29 >> 0] | 0) == 2) q = b[30752 + (a[f + 33 >> 0] << 1) >> 1] | 0;
		else q = 0;
		p = c[d + 4608 >> 2] | 0;
		r = 0;
		while (1) {
			if ((r | 0) >= (p | 0)) break;
			m = +g[l + (r << 2) >> 2] * 8.0;
			n = (g[k >> 2] = m, c[k >> 2] | 0);
			if ((n & 2130706432) >>> 0 <= 1249902592) {
				n = (n | 0) < 0;
				m = n ? m + -8388608.0 + 8388608.0 : m + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			}
			c[E + (r << 2) >> 2] = ~~m;
			r = r + 1 | 0
		}
		if ((c[d + 4652 >> 2] | 0) <= 1 ? (c[d + 4704 >> 2] | 0) <= 0 : 0) {
			Hb(d, h, f, E, j, C, B, x, z, D, A, y, e + 228 | 0, v, q);
			i = F;
			return
		}
		Ib(d, h, f, E, j, C, B, x, z, D, A, y, e + 228 | 0, v, q);
		i = F;
		return
	}

	function vc(a, b, d, e, f, j) {
		a = a | 0;
		b = b | 0;
		d = +d;
		e = e | 0;
		f = f | 0;
		j = j | 0;
		var k = 0.0,
			l = 0,
			m = 0.0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0.0,
			s = 0.0,
			t = 0,
			u = 0,
			v = 0.0,
			w = 0,
			x = 0,
			y = 0.0,
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
			J = 0;
		F = i;
		i = i + 656 | 0;
		A = F + 528 | 0;
		B = F + 400 | 0;
		D = F + 264 | 0;
		z = F + 128 | 0;
		E = F;
		k = +wc(b, _(f, e) | 0);
		n = A;
		o = n + 128 | 0;
		do {
			c[n >> 2] = 0;
			n = n + 4 | 0
		} while ((n | 0) < (o | 0));
		o = j + 1 | 0;
		p = 0;
		while (1) {
			if ((p | 0) >= (f | 0)) break;
			n = _(p, e) | 0;
			l = b + (n << 2) | 0;
			q = 1;
			while (1) {
				if ((q | 0) >= (o | 0)) break;
				m = +xc(l, b + (n + q << 2) | 0, e - q | 0);
				w = A + (q + -1 << 3) | 0;
				h[w >> 3] = +h[w >> 3] + m;
				q = q + 1 | 0
			}
			p = p + 1 | 0
		}
		n = B;
		l = A;
		o = n + 128 | 0;
		do {
			c[n >> 2] = c[l >> 2];
			n = n + 4 | 0;
			l = l + 4 | 0
		} while ((n | 0) < (o | 0));
		y = k * 9.999999747378752e-06;
		v = k + y + 9.999999717180685e-10;
		h[D >> 3] = v;
		h[z >> 3] = v;
		v = d;
		w = 1;
		n = 0;
		x = 2;
		m = 1.0;
		while (1) {
			if ((n | 0) >= (j | 0)) break;
			o = e - n | 0;
			l = o + -1 | 0;
			u = 0;
			while (1) {
				if ((u | 0) >= (f | 0)) break;
				t = _(u, e) | 0;
				s = +g[b + (t + l << 2) >> 2];
				q = b + (t + n << 2) | 0;
				p = 0;
				d = +g[b + (t + n << 2) >> 2];
				r = s;
				while (1) {
					if ((n | 0) == (p | 0)) {
						q = 0;
						break
					}
					I = +g[b + (t + (n - p + -1) << 2) >> 2];
					J = A + (p << 3) | 0;
					h[J >> 3] = +h[J >> 3] - +g[q >> 2] * I;
					H = +g[b + (t + (o + p) << 2) >> 2];
					J = B + (p << 3) | 0;
					h[J >> 3] = +h[J >> 3] - s * H;
					G = +h[E + (p << 3) >> 3];
					p = p + 1 | 0;
					d = d + I * G;
					r = r + H * G
				}
				while (1) {
					if ((q | 0) == (w | 0)) break;
					p = D + (q << 3) | 0;
					h[p >> 3] = +h[p >> 3] - d * +g[b + (t + (n - q) << 2) >> 2];
					p = z + (q << 3) | 0;
					h[p >> 3] = +h[p >> 3] - r * +g[b + (t + (o + q + -1) << 2) >> 2];
					q = q + 1 | 0
				}
				u = u + 1 | 0
			}
			q = 0;
			d = +h[A + (n << 3) >> 3];
			s = +h[B + (n << 3) >> 3];
			while (1) {
				if ((n | 0) == (q | 0)) break;
				r = +h[E + (q << 3) >> 3];
				u = n - q + -1 | 0;
				q = q + 1 | 0;
				d = d + +h[B + (u << 3) >> 3] * r;
				s = s + +h[A + (u << 3) >> 3] * r
			}
			u = n + 1 | 0;
			h[D + (u << 3) >> 3] = d;
			h[z + (u << 3) >> 3] = s;
			d = +h[z >> 3];
			r = +h[D >> 3];
			q = 0;
			while (1) {
				if ((n | 0) == (q | 0)) break;
				H = +h[E + (q << 3) >> 3];
				t = q + 1 | 0;
				d = d + +h[z + (t << 3) >> 3] * H;
				r = r + +h[D + (t << 3) >> 3] * H;
				s = s + +h[z + (n - q << 3) >> 3] * H;
				q = t
			}
			r = s * -2.0 / (r + d);
			d = m * (1.0 - r * r);
			if (d <= v) {
				r = +O(+(1.0 - v / m));
				if (s > 0.0) {
					m = v;
					r = -r;
					l = 1
				} else {
					m = v;
					l = 1
				}
			} else {
				m = d;
				l = 0
			}
			q = u >> 1;
			p = 0;
			while (1) {
				if ((p | 0) >= (q | 0)) break;
				o = E + (p << 3) | 0;
				H = +h[o >> 3];
				t = E + (n - p + -1 << 3) | 0;
				d = +h[t >> 3];
				h[o >> 3] = H + r * d;
				h[t >> 3] = d + r * H;
				p = p + 1 | 0
			}
			h[E + (n << 3) >> 3] = r;
			if (!l) q = 0;
			else {
				C = 30;
				break
			}
			while (1) {
				if ((q | 0) == (x | 0)) break;
				p = D + (q << 3) | 0;
				H = +h[p >> 3];
				t = z + (n - q + 1 << 3) | 0;
				d = +h[t >> 3];
				h[p >> 3] = H + r * d;
				h[t >> 3] = d + r * H;
				q = q + 1 | 0
			}
			w = w + 1 | 0;
			n = u;
			x = x + 1 | 0
		}
		if ((C | 0) == 30) {
			while (1) {
				n = n + 1 | 0;
				if ((n | 0) >= (j | 0)) break;
				h[E + (n << 3) >> 3] = 0.0;
				C = 30
			}
			if (l) {
				l = 0;
				while (1) {
					if ((l | 0) >= (j | 0)) {
						l = 0;
						break
					}
					g[a + (l << 2) >> 2] = - +h[E + (l << 3) >> 3];
					l = l + 1 | 0
				}
				while (1) {
					if ((l | 0) >= (f | 0)) break;
					k = k - +wc(b + ((_(l, e) | 0) << 2) | 0, j);
					l = l + 1 | 0
				}
				k = k * m;
				i = F;
				return +k
			}
		}
		k = +h[D >> 3];
		l = 0;
		m = 1.0;
		while (1) {
			if ((l | 0) >= (j | 0)) break;
			r = +h[E + (l << 3) >> 3];
			w = l + 1 | 0;
			H = k + +h[D + (w << 3) >> 3] * r;
			g[a + (l << 2) >> 2] = -r;
			k = H;
			l = w;
			m = m + r * r
		}
		k = k - y * m;
		i = F;
		return +k
	}

	function wc(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0.0,
			d = 0,
			e = 0,
			f = 0,
			h = 0.0,
			i = 0.0,
			j = 0.0,
			k = 0.0;
		e = b & 65532;
		d = b & 65532;
		c = 0.0;
		f = 0;
		while (1) {
			if ((f | 0) >= (e | 0)) break;
			k = +g[a + (f << 2) >> 2];
			j = +g[a + ((f | 1) << 2) >> 2];
			i = +g[a + ((f | 2) << 2) >> 2];
			h = +g[a + ((f | 3) << 2) >> 2];
			c = c + (k * k + j * j + i * i + h * h);
			f = f + 4 | 0
		}
		while (1) {
			if ((d | 0) >= (b | 0)) break;
			h = +g[a + (d << 2) >> 2];
			d = d + 1 | 0;
			c = c + h * h
		}
		return +c
	}

	function xc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0.0,
			e = 0,
			f = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0.0;
		f = c & 65532;
		e = c & 65532;
		d = 0.0;
		h = 0;
		while (1) {
			if ((h | 0) >= (f | 0)) break;
			k = h | 1;
			j = h | 2;
			i = h | 3;
			d = d + (+g[a + (h << 2) >> 2] * +g[b + (h << 2) >> 2] + +g[a + (k << 2) >> 2] * +g[b + (k << 2) >> 2] + +g[a + (j << 2) >> 2] * +g[b + (j << 2) >> 2] + +g[a + (i << 2) >> 2] * +g[b + (i << 2) >> 2]);
			h = h + 4 | 0
		}
		while (1) {
			if ((e | 0) >= (c | 0)) break;
			l = d + +g[a + (e << 2) >> 2] * +g[b + (e << 2) >> 2];
			e = e + 1 | 0;
			d = l
		}
		return +d
	}

	function yc(a, b) {
		a = a | 0;
		b = b | 0;
		var c = 0.0,
			d = 0.0,
			e = 0,
			f = 0.0,
			h = 0,
			j = 0,
			k = 0,
			l = 0.0,
			m = 0,
			n = 0;
		n = i;
		i = i + 128 | 0;
		k = n;
		j = b & 1;
		e = k + (j << 6) | 0;
		nd(e | 0, a | 0, b << 2 | 0) | 0;
		a = e;
		l = 1.0;
		while (1) {
			h = b + -1 | 0;
			if ((b | 0) <= 1) break;
			c = +g[k + (j << 6) + (h << 2) >> 2];
			d = -c;
			if (c < -.9998999834060669 | c > .9998999834060669) {
				c = 0.0;
				m = 10;
				break
			}
			f = 1.0 - d * d;
			c = 1.0 / f;
			b = h & 1;
			a = k + (b << 6) | 0;
			e = 0;
			while (1) {
				if ((h | 0) <= (e | 0)) break;
				g[k + (b << 6) + (e << 2) >> 2] = (+g[k + (j << 6) + (e << 2) >> 2] - +g[k + (j << 6) + (h - e + -1 << 2) >> 2] * d) * c;
				e = e + 1 | 0
			}
			j = b;
			l = l * f;
			b = h
		}
		if ((m | 0) == 10) {
			i = n;
			return +c
		}
		d = +g[a >> 2];
		c = -d;
		if (d < -.9998999834060669 | d > .9998999834060669) {
			c = 0.0;
			i = n;
			return +c
		}
		c = l * (1.0 - c * c);
		i = n;
		return +c
	}

	function zc(b, c) {
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

	function Ac(a) {
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
		b = c[11016 + (b << 2) >> 2] | 0;
		d = ((_(c[b + 4 >> 2] | 0, a) | 0) << 2) + 200 + (a << 12) | 0;
		a = d + ((_(a * 3 | 0, c[b + 8 >> 2] | 0) | 0) << 2) + 42788 | 0;
		return a | 0
	}

	function Bc(a, d, e, f) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
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
			v = 0;
		v = i;
		i = i + 32 | 0;
		r = v + 16 | 0;
		q = v + 8 | 0;
		p = v;
		a: do
			if ((a | 0) < 16e3)
				if ((a | 0) < 12e3) switch (a | 0) {
					case 8e3:
						{
							u = 2;
							break a
						}
					default:
						break a
				} else switch (a | 0) {
					case 12e3:
						{
							u = 2;
							break a
						}
					default:
						break a
				} else {
					if ((a | 0) < 24e3) switch (a | 0) {
						case 16e3:
							{
								u = 2;
								break a
							}
						default:
							break a
					}
					if ((a | 0) < 48e3) switch (a | 0) {
						case 24e3:
							{
								u = 2;
								break a
							}
						default:
							break a
					} else switch (a | 0) {
						case 48e3:
							{
								u = 2;
								break a
							}
						default:
							break a
					}
				}
				while (0);
		b: do
			if ((u | 0) == 2 ? (h = (d | 0) == 1, (d + -1 | 0) >>> 0 < 2) : 0) {
				switch (e | 0) {
					case 2048:
					case 2049:
					case 2051:
						break;
					default:
						break b
				}
				s = ad(Ac(d) | 0) | 0;
				t = s;
				if (!s) {
					if (!f) {
						e = 0;
						i = v;
						return e | 0
					}
					c[f >> 2] = -7;
					e = 0;
					i = v;
					return e | 0
				}
				c: do
					if ((a | 0) < 16e3)
						if ((a | 0) < 12e3) switch (a | 0) {
							case 8e3:
								{
									u = 10;
									break c
								}
							default:
								{
									h = -1;
									break c
								}
						} else switch (a | 0) {
							case 12e3:
								{
									u = 10;
									break c
								}
							default:
								{
									h = -1;
									break c
								}
						} else {
							if ((a | 0) < 24e3) switch (a | 0) {
								case 16e3:
									{
										u = 10;
										break c
									}
								default:
									{
										h = -1;
										break c
									}
							}
							if ((a | 0) < 48e3) switch (a | 0) {
								case 24e3:
									{
										u = 10;
										break c
									}
								default:
									{
										h = -1;
										break c
									}
							} else switch (a | 0) {
								case 48e3:
									{
										u = 10;
										break c
									}
								default:
									{
										h = -1;
										break c
									}
							}
						}
						while (0);
				d: do
					if ((u | 0) == 10) {
						switch (e | 0) {
							case 2048:
							case 2049:
							case 2051:
								break;
							default:
								{
									h = -1;
									break d
								}
						}
						id(s | 0, 0, Ac(d) | 0) | 0;
						c[s + 4 >> 2] = 18220;
						c[s >> 2] = 42788;
						n = s + (c[s + 4 >> 2] | 0) | 0;
						l = s + 42788 | 0;
						c[s + 100 >> 2] = d;
						c[s + 168 >> 2] = d;
						m = s + 132 | 0;
						c[m >> 2] = a;
						h = s + 18216 | 0;
						c[h >> 2] = 0;
						if (!(Cb(n, 0, s + 8 | 0) | 0)) {
							c[s + 8 >> 2] = d;
							c[s + 12 >> 2] = d;
							c[s + 16 >> 2] = c[m >> 2];
							c[s + 20 >> 2] = 16e3;
							c[s + 24 >> 2] = 8e3;
							c[s + 28 >> 2] = 16e3;
							c[s + 32 >> 2] = 20;
							c[s + 36 >> 2] = 25e3;
							c[s + 40 >> 2] = 0;
							n = s + 44 | 0;
							c[n >> 2] = 9;
							c[s + 48 >> 2] = 0;
							c[s + 52 >> 2] = 0;
							c[s + 56 >> 2] = 0;
							c[s + 72 >> 2] = 0;
							k = c[h >> 2] | 0;
							h = 0;
							e: while (1) {
								if ((h | 0) < 1) j = 0;
								else {
									h = 0;
									break
								}
								while (1) {
									if ((j | 0) >= 4) break;
									if (!j) {
										u = 18;
										break e
									}
									j = j + 1 | 0
								}
								h = h + 1 | 0
							}
							if ((u | 0) == 18) h = c[11016 + (h << 2) >> 2] | 0;
							if (!((d | 0) < 0 | (d | 0) > 2) ? (o = h, (h | 0) != 0) : 0) {
								j = ((_(c[o + 4 >> 2] | 0, d) | 0) << 2) + 200 + (d << 12) | 0;
								id(l | 0, 0, j + ((_(d * 3 | 0, c[o + 8 >> 2] | 0) | 0) << 2) | 0) | 0;
								c[l >> 2] = h;
								c[s + 42792 >> 2] = d;
								c[s + 42796 >> 2] = d;
								c[s + 42816 >> 2] = 1;
								c[s + 42820 >> 2] = 0;
								c[s + 42824 >> 2] = c[(c[l >> 2] | 0) + 12 >> 2];
								c[s + 42836 >> 2] = 1;
								c[s + 42860 >> 2] = k;
								c[s + 42840 >> 2] = 1;
								c[s + 42804 >> 2] = 1;
								c[s + 42828 >> 2] = -1;
								c[s + 42832 >> 2] = 0;
								c[s + 42800 >> 2] = 0;
								c[s + 42812 >> 2] = 5;
								c[s + 42848 >> 2] = 24;
								Ya(l, 4028, p) | 0;
								f: do
									if ((a | 0) < 16e3)
										if ((a | 0) < 12e3) {
											switch (a | 0) {
												case 8e3:
													break;
												default:
													{
														u = 28;
														break f
													}
											}
											h = 6;
											break
										} else {
											switch (a | 0) {
												case 12e3:
													break;
												default:
													{
														u = 28;
														break f
													}
											}
											h = 4;
											break
										}
								else {
									if ((a | 0) < 24e3) {
										switch (a | 0) {
											case 16e3:
												break;
											default:
												{
													u = 28;
													break f
												}
										}
										h = 3;
										break
									}
									if ((a | 0) >= 48e3) switch (a | 0) {
										case 48e3:
											{
												h = 1;
												break f
											}
										default:
											{
												u = 28;
												break f
											}
									}
									switch (a | 0) {
										case 24e3:
											break;
										default:
											{
												u = 28;
												break f
											}
									}
									h = 2
								}
								while (0);
								if ((u | 0) == 28) h = 0;
								c[s + 42816 >> 2] = h;
								c[q >> 2] = 0;
								Ya(l, 10016, q) | 0;
								c[r >> 2] = c[n >> 2];
								Ya(l, 4010, r) | 0;
								c[s + 136 >> 2] = 1;
								c[s + 140 >> 2] = 1;
								c[s + 152 >> 2] = -1e3;
								c[s + 148 >> 2] = (_(a, d) | 0) + 3e3;
								c[s + 96 >> 2] = e;
								c[s + 112 >> 2] = -1e3;
								c[s + 116 >> 2] = -1e3;
								c[s + 120 >> 2] = 1105;
								c[s + 108 >> 2] = -1e3;
								c[s + 124 >> 2] = -1e3;
								c[s + 128 >> 2] = -1;
								h = c[m >> 2] | 0;
								c[s + 160 >> 2] = (h | 0) / 100 | 0;
								c[s + 156 >> 2] = 24;
								c[s + 144 >> 2] = 5e3;
								c[s + 104 >> 2] = (h | 0) / 250 | 0;
								b[s + 172 >> 1] = 16384;
								g[s + 180 >> 2] = 1.0;
								c[s + 176 >> 2] = (Wb(60) | 0) << 8;
								c[s + 224 >> 2] = 1;
								c[s + 200 >> 2] = 1001;
								c[s + 216 >> 2] = 1105;
								h = 0
							} else h = -3
						} else h = -3
					}
				while (0);
				if (f) c[f >> 2] = h;
				if (!h) {
					e = t;
					i = v;
					return e | 0
				}
				bd(s);
				e = 0;
				i = v;
				return e | 0
			}
		while (0);
		if (!f) {
			e = 0;
			i = v;
			return e | 0
		}
		c[f >> 2] = -1;
		e = 0;
		i = v;
		return e | 0
	}

	function Cc(a, b, c, d, e, f, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		var i = 0.0,
			j = 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (c | 0)) break;
			g[b + (j << 2) >> 2] = +g[a + ((_(j + d | 0, h) | 0) + e << 2) >> 2] * 32768.0;
			j = j + 1 | 0
		}
		a: do
			if ((f | 0) <= -1) {
				if ((f | 0) == -2) {
					j = 1;
					while (1) {
						if ((j | 0) < (h | 0)) e = 0;
						else break a;
						while (1) {
							if ((e | 0) >= (c | 0)) break;
							i = +g[a + ((_(e + d | 0, h) | 0) + j << 2) >> 2] * 32768.0;
							f = b + (e << 2) | 0;
							g[f >> 2] = +g[f >> 2] + i;
							e = e + 1 | 0
						}
						j = j + 1 | 0
					}
				}
			} else {
				e = 0;
				while (1) {
					if ((e | 0) >= (c | 0)) break a;
					i = +g[a + ((_(e + d | 0, h) | 0) + f << 2) >> 2] * 32768.0;
					j = b + (e << 2) | 0;
					g[j >> 2] = +g[j >> 2] + i;
					e = e + 1 | 0
				}
			}
		while (0);
		i = (h | 0) == -2 ? -.5 : .5;
		j = 0;
		while (1) {
			if ((j | 0) >= (c | 0)) break;
			e = b + (j << 2) | 0;
			g[e >> 2] = +g[e >> 2] * i;
			j = j + 1 | 0
		}
		return
	}

	function Dc(d, e, f, h, j, l, m, n, o, p, q, r, s) {
		d = d | 0;
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
		var t = 0,
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
			J = 0,
			K = 0,
			L = 0,
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
			Ka = 0,
			La = 0,
			Ma = 0,
			Na = 0,
			Oa = 0,
			Pa = 0,
			Qa = 0,
			Ra = 0,
			Sa = 0,
			Ta = 0,
			Ua = 0,
			Va = 0,
			Wa = 0,
			Za = 0,
			_a = 0,
			$a = 0,
			ab = 0,
			bb = 0.0,
			cb = 0.0,
			db = 0.0,
			eb = 0.0,
			fb = 0.0,
			hb = 0.0,
			ib = 0.0,
			jb = 0.0;
		ab = i;
		i = i + 1008 | 0;
		Ua = ab + 480 | 0;
		Ta = ab + 472 | 0;
		Sa = ab + 464 | 0;
		Ra = ab + 456 | 0;
		Oa = ab + 448 | 0;
		Na = ab + 440 | 0;
		Za = ab + 136 | 0;
		Ka = ab + 128 | 0;
		Ja = ab + 120 | 0;
		Ia = ab + 112 | 0;
		Ha = ab + 104 | 0;
		Ga = ab + 96 | 0;
		Fa = ab + 88 | 0;
		ta = ab + 80 | 0;
		sa = ab + 72 | 0;
		ra = ab + 64 | 0;
		oa = ab + 56 | 0;
		ma = ab + 48 | 0;
		la = ab + 40 | 0;
		qa = ab + 32 | 0;
		pa = ab + 24 | 0;
		Z = ab + 8 | 0;
		Y = ab;
		ja = ab + 1e3 | 0;
		Ma = ab + 952 | 0;
		Qa = ab + 944 | 0;
		za = ab + 940 | 0;
		Ea = ab + 912 | 0;
		z = ab + 824 | 0;
		L = ab + 792 | 0;
		$ = ab + 488 | 0;
		ga = ab + 484 | 0;
		La = ab + 1006 | 0;
		Pa = ab + 1004 | 0;
		c[Qa >> 2] = 0;
		t = (j | 0) > 1276 ? 1276 : j;
		Va = d + 18212 | 0;
		c[Va >> 2] = 0;
		ka = d + 144 | 0;
		if (!(c[ka >> 2] | 0)) {
			C = f * 400 | 0;
			D = d + 132 | 0;
			E = c[D >> 2] | 0;
			if ((C | 0) != (E | 0))
				if (!((f * 200 | 0) == (E | 0) | (f * 100 | 0) == (E | 0)) ? (fa = f * 50 | 0, !((fa | 0) == (E | 0) | (f * 25 | 0) == (E | 0) | (fa | 0) == (E * 3 | 0))) : 0) {
					ga = -1;
					i = ab;
					return ga | 0
				} else $a = 6;
			else _a = D
		} else {
			E = d + 132 | 0;
			D = E;
			C = f * 400 | 0;
			E = c[E >> 2] | 0;
			$a = 6
		}
		if (($a | 0) == 6)
			if ((C | 0) < (E | 0)) {
				ga = -1;
				i = ab;
				return ga | 0
			} else _a = D;
		if ((t | 0) < 1) {
			ga = -1;
			i = ab;
			return ga | 0
		}
		U = c[d + 4 >> 2] | 0;
		ia = d + U | 0;
		Da = d + (c[d >> 2] | 0) | 0;
		if ((c[d + 96 >> 2] | 0) == 2051) va = 0;
		else va = c[d + 104 >> 2] | 0;
		W = c[d + 156 >> 2] | 0;
		W = (W | 0) > (l | 0) ? l : W;
		c[Y >> 2] = za;
		Ya(Da, 10015, Y) | 0;
		c[Ea >> 2] = 0;
		y = d + 44 | 0;
		if ((c[y >> 2] | 0) > 6 ? (c[_a >> 2] | 0) == 48e3 : 0) {
			R = c[d + 12596 >> 2] | 0;
			S = c[d + 12600 >> 2] | 0;
			Oc(d + 4092 | 0, c[za >> 2] | 0, m, n, f, o, p, q, 48e3, W, r, Ea)
		} else {
			R = -1;
			S = -1
		}
		E = d + 128 | 0;
		c[E >> 2] = -1;
		B = d + 18204 | 0;
		c[B >> 2] = 0;
		do
			if (c[Ea >> 2] | 0) {
				if ((c[d + 112 >> 2] | 0) == -1e3) {
					fa = ~~+M(+((1.0 - +g[Ea + 20 >> 2]) * 100.0 + .5));
					c[E >> 2] = fa;
					E = fa
				} else E = -1;
				D = c[Ea + 24 >> 2] | 0;
				if ((D | 0) < 13) {
					c[B >> 2] = 1101;
					break
				}
				if ((D | 0) < 15) {
					c[B >> 2] = 1102;
					break
				}
				if ((D | 0) < 17) {
					c[B >> 2] = 1103;
					break
				}
				if ((D | 0) < 19) {
					c[B >> 2] = 1104;
					break
				} else {
					c[B >> 2] = 1105;
					break
				}
			} else E = -1;
		while (0);
		Wa = d + 100 | 0;
		n = c[Wa >> 2] | 0;
		v = (n | 0) == 2;
		if (v ? (c[d + 108 >> 2] | 0) != 1 : 0) {
			C = (c[_a >> 2] | 0) / (f | 0) | 0;
			H = 25.0 / ((C | 0) < 50 ? 50.0 : +(C | 0));
			D = 0;
			G = 0.0;
			F = 0.0;
			I = 0.0;
			while (1) {
				if ((D | 0) >= (f | 0)) break;
				fa = D << 1;
				jb = +g[e + (fa << 2) >> 2];
				eb = +g[e + ((fa | 1) << 2) >> 2];
				ib = +g[e + ((fa | 2) << 2) >> 2];
				db = +g[e + ((fa | 3) << 2) >> 2];
				hb = +g[e + ((fa | 4) << 2) >> 2];
				cb = +g[e + ((fa | 5) << 2) >> 2];
				fb = +g[e + ((fa | 6) << 2) >> 2];
				bb = +g[e + ((fa | 7) << 2) >> 2];
				D = D + 4 | 0;
				G = G + (jb * jb + ib * ib + hb * hb + fb * fb);
				F = F + (jb * eb + ib * db + hb * cb + fb * bb);
				I = I + (eb * eb + db * db + cb * cb + bb * bb)
			}
			hb = 1.0 - H;
			ea = d + 232 | 0;
			H = +g[ea >> 2];
			G = H + hb * (G - H);
			g[ea >> 2] = G;
			D = d + 236 | 0;
			H = +g[D >> 2];
			F = H + hb * (F - H);
			g[D >> 2] = F;
			fa = d + 240 | 0;
			H = +g[fa >> 2];
			H = H + hb * (I - H);
			g[fa >> 2] = H;
			G = G < 0.0 ? 0.0 : G;
			g[ea >> 2] = G;
			F = F < 0.0 ? 0.0 : F;
			g[D >> 2] = F;
			H = H < 0.0 ? 0.0 : H;
			g[fa >> 2] = H;
			if ((G > H ? G : H) > 7.999999797903001e-04) {
				eb = +O(+G);
				hb = +O(+H);
				G = +O(+eb);
				fb = +O(+hb);
				hb = eb * hb;
				eb = F < hb ? F : hb;
				g[D >> 2] = eb;
				hb = eb / (hb + 1.0000000036274937e-15);
				fb = +O(+(1.0 - hb * hb)) * (+N(+(G - fb)) / (G + 1.0000000036274937e-15 + fb));
				fa = d + 244 | 0;
				G = +g[fa >> 2];
				hb = +(C | 0);
				G = G + (fb - G) / hb;
				g[fa >> 2] = G;
				fa = d + 248 | 0;
				hb = +g[fa >> 2] - .019999999552965164 / hb;
				G = hb > G ? hb : G;
				g[fa >> 2] = G
			} else G = +g[d + 248 >> 2];
			G = G * 20.0;
			if (G > 1.0) G = 1.0
		} else G = 0.0;
		if (!f) D = (c[_a >> 2] | 0) / 400 | 0;
		else D = f;
		C = c[d + 152 >> 2] | 0;
		switch (C | 0) {
			case -1e3:
				{
					J = c[_a >> 2] | 0;C = ((J * 60 | 0) / (D | 0) | 0) + (_(J, n) | 0) | 0;
					break
				}
			case -1:
				{
					J = c[_a >> 2] | 0;C = (_(t << 3, J) | 0) / (D | 0) | 0;
					break
				}
			default:
				J = c[_a >> 2] | 0
		}
		Ba = d + 148 | 0;
		c[Ba >> 2] = C;
		X = (J | 0) / (f | 0) | 0;
		do
			if (!((t | 0) < 3 | (C | 0) < (X * 24 | 0))) {
				if ((X | 0) < 50 ? (_(t, X) | 0) < 300 | (C | 0) < 2400 : 0) break;
				Ca = d + 136 | 0;
				w = (c[Ca >> 2] | 0) == 0;
				if (w) {
					fa = X << 3;
					C = (C + (X << 2) | 0) / (fa | 0) | 0;
					t = (C | 0) < (t | 0) ? C : t;
					C = _(t, fa) | 0;
					c[Ba >> 2] = C
				}
				da = _(X, t) | 0;
				ea = da << 3;
				m = X + -50 | 0;
				l = C - (_((n * 40 | 0) + 20 | 0, m) | 0) | 0;
				D = c[d + 112 >> 2] | 0;
				do
					if ((D | 0) != 3001)
						if ((D | 0) != 3002) {
							if ((E | 0) <= -1) {
								E = (c[d + 96 >> 2] | 0) == 2048 ? 115 : 48;
								break
							}
							E = E * 327 >> 8;
							if ((c[d + 96 >> 2] | 0) == 2049) E = (E | 0) < 115 ? E : 115
						} else E = 0;
				else E = 127; while (0);
				P = d + 108 | 0;
				D = c[P >> 2] | 0;
				if ((D | 0) == -1e3)
					if (v) {
						Aa = d + 168 | 0;
						n = (l | 0) > (((c[Aa >> 2] | 0) == 2 ? 29e3 : 31e3) | 0) ? 2 : 1;
						c[Aa >> 2] = n
					} else $a = 66;
				else if (v) {
					Aa = d + 168 | 0;
					c[Aa >> 2] = D;
					n = D
				} else $a = 66;
				if (($a | 0) == 66) {
					Aa = d + 168 | 0;
					c[Aa >> 2] = n
				}
				fa = C - (_((n * 40 | 0) + 20 | 0, m) | 0) | 0;
				A = d + 96 | 0;
				l = c[A >> 2] | 0;
				do
					if ((l | 0) != 2051) {
						D = c[d + 124 >> 2] | 0;
						if ((D | 0) == -1e3) {
							hb = 1.0 - G;
							D = ~~(hb * 16.0e3 + G * 16.0e3);
							D = D + ((_(_(E, E) | 0, ~~(hb * 64.0e3 + G * 36.0e3) - D | 0) | 0) >> 14) | 0;
							D = (l | 0) == 2048 ? D + 8e3 | 0 : D;
							l = c[d + 204 >> 2] | 0;
							if ((l | 0) == 1002) D = D + -4e3 | 0;
							else D = (l | 0) > 0 ? D + 4e3 | 0 : D;
							D = (fa | 0) >= (D | 0) ? 1002 : 1e3;
							l = d + 200 | 0;
							c[l >> 2] = D;
							do
								if (c[d + 48 >> 2] | 0) {
									if ((c[d + 40 >> 2] | 0) <= (128 - E >> 4 | 0)) break;
									c[l >> 2] = 1e3;
									D = 1e3
								}
							while (0);
							if ((c[d + 52 >> 2] | 0) != 0 & (E | 0) > 100) {
								c[l >> 2] = 1e3;
								D = 1e3
							} else $a = 79
						} else {
							l = d + 200 | 0;
							c[l >> 2] = D;
							$a = 79
						}
						if (($a | 0) == 79)
							if ((D | 0) == 1002) {
								xa = l;
								D = 1002;
								break
							}
						if (((J | 0) / 100 | 0 | 0) > (f | 0)) {
							c[l >> 2] = 1002;
							xa = l;
							D = 1002
						} else xa = l
					} else {
						xa = d + 200 | 0;
						c[xa >> 2] = 1002;
						D = 1002
					}
				while (0);
				Q = d + 164 | 0;
				if (c[Q >> 2] | 0) {
					c[xa >> 2] = 1002;
					D = 1002
				}
				V = (X | 0) > 50;
				if ((t | 0) < ((_(V ? 12e3 : 8e3, f) | 0) / (J << 3 | 0) | 0 | 0)) {
					c[xa >> 2] = 1002;
					D = 1002
				}
				do
					if (((n | 0) == 1 ? (c[d + 208 >> 2] | 0) == 2 : 0) ? (x = d + 64 | 0, !((c[x >> 2] | 0) != 0 | (D | 0) == 1002)) : 0) {
						l = d + 204 | 0;
						m = c[l >> 2] | 0;
						if ((m | 0) == 1002) {
							$a = 91;
							break
						}
						c[x >> 2] = 1;
						c[Aa >> 2] = 2;
						ua = l
					} else $a = 91;
				while (0);
				if (($a | 0) == 91) {
					c[d + 64 >> 2] = 0;
					m = d + 204 | 0;
					ua = m;
					m = c[m >> 2] | 0
				}
				do
					if ((m | 0) > 0) {
						l = (m | 0) == 1002;
						if ((D | 0) != 1002) {
							if (!l) {
								v = D;
								l = 0;
								D = 0;
								wa = 0;
								break
							}
							v = D;
							l = (D | 0) != 1002 & 1;
							D = 1;
							wa = 0;
							break
						}
						if (l) {
							v = 1002;
							l = 0;
							D = 0;
							wa = 0;
							break
						}
						D = (D | 0) != 1002 & 1;
						if (((J | 0) / 100 | 0 | 0) > (f | 0)) {
							v = 1002;
							l = D;
							D = 0;
							wa = 0;
							break
						}
						c[xa >> 2] = m;
						v = m;
						l = D;
						D = 1;
						wa = 1
					} else {
						v = D;
						l = 0;
						D = 0;
						wa = 0
					}
				while (0);
				ha = d + 220 | 0;
				if (!(c[ha >> 2] | 0)) {
					n = l;
					l = 0;
					if (!D) {
						ba = n;
						ca = 0
					} else $a = 102
				} else {
					c[ha >> 2] = 0;
					n = 1;
					l = 1;
					D = 1;
					$a = 102
				}
				do
					if (($a | 0) == 102) {
						u = (J | 0) / 200 | 0;
						u = (_(t, u) | 0) / (u + f | 0) | 0;
						u = (u | 0) > 257 ? 257 : u;
						if (w) {
							ba = n;
							ca = u;
							break
						}
						ca = (C | 0) / 1600 | 0;
						ba = n;
						ca = (u | 0) < (ca | 0) ? u : ca
					}
				while (0);
				a: do
					if ((v | 0) == 1002) {
						v = fa;
						$a = 113
					} else {
						if ((m | 0) == 1002) {
							Cb(ia, c[d + 18216 >> 2] | 0, z) | 0;
							C = (c[xa >> 2] | 0) == 1002;
							if (C) {
								v = fa;
								l = 1;
								$a = 113;
								break
							} else l = 1
						} else C = (v | 0) == 1002;
						do
							if (!(c[d + 224 >> 2] | 0)) {
								if (c[d + 80 >> 2] | 0) break;
								C = d + 216 | 0;
								w = C;
								C = c[C >> 2] | 0;
								K = l;
								break a
							}
						while (0);
						if (C) {
							v = fa;
							$a = 113;
							break
						}
						v = (_(fa, (c[y >> 2] | 0) + 45 | 0) | 0) / 50 | 0;
						v = (c[Ca >> 2] | 0) == 0 ? v + -1e3 | 0 : v;
						$a = 113
					}
				while (0);
				do
					if (($a | 0) == 113) {
						if ((c[Wa >> 2] | 0) == 2 ? (c[P >> 2] | 0) != 1 : 0) {
							m = 23508;
							n = 23476
						} else {
							m = 23572;
							n = 23540
						}
						E = _(E, E) | 0;
						C = 0;
						while (1) {
							if ((C | 0) == 8) break;
							z = c[m + (C << 2) >> 2] | 0;
							c[L + (C << 2) >> 2] = z + ((_(E, (c[n + (C << 2) >> 2] | 0) - z | 0) | 0) >> 14);
							C = C + 1 | 0
						}
						n = (c[d + 224 >> 2] | 0) == 0;
						u = d + 216 | 0;
						E = 1105;
						do {
							m = E << 1;
							C = c[L + (m + -2204 << 2) >> 2] | 0;
							m = c[L + (m + -2203 << 2) >> 2] | 0;
							do
								if (n)
									if ((c[u >> 2] | 0) < (E | 0)) {
										C = C + m | 0;
										break
									} else {
										C = C - m | 0;
										break
									}
							while (0);
							if ((v | 0) >= (C | 0)) break;
							E = E + -1 | 0
						} while ((E | 0) > 1101);
						c[u >> 2] = E;
						if (!n) {
							w = u;
							C = E;
							K = l;
							break
						}
						if ((c[xa >> 2] | 0) == 1002) {
							w = u;
							C = E;
							K = l;
							break
						}
						if (!((c[d + 84 >> 2] | 0) == 0 & (E | 0) > 1103)) {
							w = u;
							C = E;
							K = l;
							break
						}
						c[u >> 2] = 1103;
						w = u;
						C = 1103;
						K = l
					}
				while (0);
				E = c[d + 120 >> 2] | 0;
				if ((C | 0) > (E | 0)) c[w >> 2] = E;
				else E = C;
				J = d + 116 | 0;
				C = c[J >> 2] | 0;
				n = (C | 0) == -1e3;
				if (!n) {
					c[w >> 2] = C;
					E = C
				}
				m = (c[xa >> 2] | 0) == 1002;
				if ((m ^ 1) & (ea | 0) < 15e3) {
					E = (E | 0) < 1103 ? E : 1103;
					c[w >> 2] = E
				}
				C = c[_a >> 2] | 0;
				do
					if ((C | 0) < 24001) {
						if ((E | 0) > 1104) {
							c[w >> 2] = 1104;
							E = 1104
						}
						if ((C | 0) >= 16001) break;
						if ((E | 0) > 1103) {
							c[w >> 2] = 1103;
							E = 1103
						}
						if ((C | 0) >= 12001) break;
						if ((E | 0) > 1102) {
							c[w >> 2] = 1102;
							E = 1102
						}
						if (!((C | 0) < 8001 & (E | 0) > 1101)) break;
						c[w >> 2] = 1101;
						E = 1101
					}
				while (0);
				l = c[B >> 2] | 0;
				if (!((l | 0) == 0 | n ^ 1)) {
					C = c[Aa >> 2] | 0;
					do
						if ((fa | 0) > (C * 18e3 | 0) | m ^ 1) {
							if (!((fa | 0) > (C * 24e3 | 0) | m ^ 1)) {
								C = 1102;
								break
							}
							if ((fa | 0) <= (C * 3e4 | 0)) {
								C = 1103;
								break
							}
							C = (fa | 0) > (C * 44e3 | 0) ? 1105 : 1104
						} else C = 1101;
					while (0);
					z = (l | 0) > (C | 0) ? l : C;
					c[B >> 2] = z;
					c[w >> 2] = (E | 0) < (z | 0) ? E : z
				}
				c[Z >> 2] = W;
				Ya(Da, 4036, Z) | 0;
				C = c[xa >> 2] | 0;
				E = (C | 0) == 1002;
				do
					if (E) {
						if ((c[w >> 2] | 0) != 1102) break;
						c[w >> 2] = 1103
					}
				while (0);
				if (c[Q >> 2] | 0) c[w >> 2] = 1101;
				m = c[_a >> 2] | 0;
				do
					if (((m | 0) / 50 | 0 | 0) < (f | 0)) {
						if (!E ? (T = c[w >> 2] | 0, (T | 0) <= 1103) : 0) {
							l = T;
							break
						}
						if ((R | 0) != -1) {
							c[d + 12596 >> 2] = R;
							c[d + 12600 >> 2] = S
						}
						n = ((m | 0) / 25 | 0 | 0) < (f | 0) ? 3 : 2;
						y = (j + -3 | 0) / (n | 0) | 0;
						y = (y | 0) > 1276 ? 1276 : y;
						m = _(n, y) | 0;
						E = na() | 0;
						z = i;
						i = i + ((1 * m | 0) + 15 & -16) | 0;
						c[$ + 4 >> 2] = 0;
						m = d + 124 | 0;
						l = c[m >> 2] | 0;
						C = c[J >> 2] | 0;
						D = c[P >> 2] | 0;
						c[m >> 2] = c[xa >> 2];
						c[J >> 2] = c[w >> 2];
						u = c[Aa >> 2] | 0;
						c[P >> 2] = u;
						A = d + 64 | 0;
						B = c[A >> 2] | 0;
						if (!B) c[d + 208 >> 2] = u;
						else c[P >> 2] = 1;
						u = (wa | 0) != 0;
						t = n + -1 | 0;
						x = 0;
						while (1) {
							if ((x | 0) >= (n | 0)) {
								$a = 174;
								break
							}
							c[A >> 2] = 0;
							if (u & (x | 0) == (t | 0)) c[m >> 2] = 1002;
							w = c[_a >> 2] | 0;
							v = z + (_(x, y) | 0) | 0;
							w = Dc(d, e + ((_(x, (_(c[Wa >> 2] | 0, w) | 0) / 50 | 0) | 0) << 2) | 0, (w | 0) / 50 | 0, v, y, W, 0, 0, o, p, q, r, s) | 0;
							if ((w | 0) < 0) {
								t = -3;
								break
							}
							if ((Mc($, v, w) | 0) < 0) {
								t = -3;
								break
							}
							x = x + 1 | 0
						}
						do
							if (($a | 0) == 174) {
								u = (c[Ca >> 2] | 0) == 0;
								if (u) {
									ga = ((c[Ba >> 2] | 0) * 3 | 0) / (1200 / (n >>> 0) | 0 | 0) | 0;
									j = (ga | 0) < (j | 0) ? ga : j
								}
								t = Nc($, n, h, j, u & 1) | 0;
								if ((t | 0) < 0) {
									t = -3;
									break
								}
								c[m >> 2] = l;
								c[J >> 2] = C;
								c[P >> 2] = D;
								c[A >> 2] = B
							}
						while (0);
						ya(E | 0);
						ga = t;
						i = ab;
						return ga | 0
					} else l = c[w >> 2] | 0;
				while (0);
				do
					if ((C | 0) == 1e3) {
						if ((l | 0) <= 1103) break;
						c[xa >> 2] = 1001
					} else {
						if (!((C | 0) == 1001 & (l | 0) < 1104)) break;
						c[xa >> 2] = 1e3
					}
				while (0);
				W = t - ca | 0;
				C = (_(c[Ba >> 2] | 0, f) | 0) / (m << 3 | 0) | 0;
				C = ((W | 0) < (C | 0) ? W : C) + -1 | 0;
				W = t + -1 | 0;
				c[Ma >> 2] = h + 1;
				S = Ma + 8 | 0;
				c[S >> 2] = 0;
				c[Ma + 12 >> 2] = 0;
				c[Ma + 16 >> 2] = 0;
				r = Ma + 20 | 0;
				c[r >> 2] = 33;
				c[Ma + 24 >> 2] = 0;
				p = Ma + 28 | 0;
				c[p >> 2] = -2147483648;
				c[Ma + 40 >> 2] = -1;
				T = Ma + 32 | 0;
				c[T >> 2] = 0;
				c[Ma + 36 >> 2] = 0;
				R = Ma + 4 | 0;
				c[R >> 2] = W;
				c[Ma + 44 >> 2] = 0;
				P = va + f | 0;
				L = _(P, c[Wa >> 2] | 0) | 0;
				o = na() | 0;
				$ = i;
				i = i + ((1 * (L << 2) | 0) + 15 & -16) | 0;
				L = d + 160 | 0;
				q = c[Wa >> 2] | 0;
				nd($ | 0, d + 252 + ((_((c[L >> 2] | 0) - va | 0, q) | 0) << 2) | 0, (_(va, q) | 0) << 2 | 0) | 0;
				if ((c[xa >> 2] | 0) == 1002) E = (Wb(60) | 0) << 8;
				else E = c[d + (U + 8) >> 2] | 0;
				q = d + 176 | 0;
				U = c[q >> 2] | 0;
				E = E - U | 0;
				E = U + (((E >> 16) * 983 | 0) + (((E & 65535) * 983 | 0) >>> 16)) | 0;
				c[q >> 2] = E;
				b: do
					if ((c[A >> 2] | 0) == 2048) {
						A = Xb(E >> 8) | 0;
						q = c[Wa >> 2] | 0;
						E = _(va, q) | 0;
						A = ((A << 16 >> 16) * 2471 | 0) / ((c[_a >> 2] | 0) / 1e3 | 0 | 0) | 0;
						B = _(A, -471) | 0;
						U = B + 268435456 | 0;
						c[Z >> 2] = U;
						c[Z + 4 >> 2] = -268435456 - B << 1;
						c[Z + 8 >> 2] = U;
						B = U >> 6;
						y = A << 16 >> 16;
						x = _(A >> 16, y) | 0;
						y = _(A & 65535, y) | 0;
						A = _(A, (A >> 15) + 1 >> 1) | 0;
						v = x + (y >>> 16) + A << 16 >> 16;
						z = B & 65535;
						c[Y >> 2] = (_(U >> 22, v) | 0) + ((_(z, v) | 0) >> 16) + (_(B, (x + (y >> 16) + A + -8388608 >> 15) + 1 >> 1) | 0);
						A = B << 16 >> 16;
						c[Y + 4 >> 2] = (_(U >> 22, A) | 0) + ((_(z, A) | 0) >> 16) + (_(B, (U >> 21) + 1 >> 1) | 0);
						Kc(e, Z, Y, d + 184 | 0, $ + (E << 2) | 0, f, q);
						if ((q | 0) == 2) Kc(e + 4 | 0, Z, Y, d + 192 | 0, $ + (E + 1 << 2) | 0, f, 2)
					} else {
						E = c[Wa >> 2] | 0;
						m = _(va, E) | 0;
						I = 12.0 / +(c[_a >> 2] | 0);
						j = 0;
						while (1) {
							if ((j | 0) >= (E | 0)) break b;
							u = j << 1;
							n = d + 184 + (u << 2) | 0;
							u = d + 184 + ((u | 1) << 2) | 0;
							v = 0;
							while (1) {
								if ((v | 0) >= (f | 0)) break;
								q = (_(E, v) | 0) + j | 0;
								fb = +g[n >> 2];
								hb = +g[e + (q << 2) >> 2] - fb;
								g[n >> 2] = fb + I * hb + 1.0000000031710769e-30;
								fb = +g[u >> 2];
								hb = hb - fb;
								g[u >> 2] = fb + I * hb + 1.0000000031710769e-30;
								g[$ + (m + q << 2) >> 2] = hb;
								v = v + 1 | 0
							}
							j = j + 1 | 0
						}
					}
				while (0);
				do
					if (s) {
						n = c[Wa >> 2] | 0;
						E = _(va, n) | 0;
						m = $ + (E << 2) | 0;
						n = _(n, f) | 0;
						u = 0;
						I = 0.0;
						while (1) {
							if ((u | 0) >= (n | 0)) break;
							hb = +g[$ + (E + u << 2) >> 2];
							u = u + 1 | 0;
							I = I + hb * hb
						}
						if (!(!(I < 1.0e9) | (I != I | 0.0 != 0.0))) break;
						id(m | 0, 0, n << 2 | 0) | 0
					}
				while (0);
				c: do
					if ((c[xa >> 2] | 0) == 1002) {
						m = 1065353216;
						z = ba;
						y = l;
						J = D;
						u = 0;
						$a = 269
					} else {
						j = _(c[Wa >> 2] | 0, f) | 0;
						B = na() | 0;
						J = i;
						i = i + ((1 * (j << 1) | 0) + 15 & -16) | 0;
						j = _(C << 3, X) | 0;
						z = c[xa >> 2] | 0;
						A = (z | 0) == 1001;
						do
							if (!A) {
								c[d + 36 >> 2] = j;
								E = c[d + 228 >> 2] | 0;
								if (!E) y = 1065353216;
								else {
									u = j;
									y = 1065353216;
									$a = 208
								}
							} else {
								m = c[Aa >> 2] | 0;
								s = _(m, (c[_a >> 2] | 0) == (f * 100 | 0) ? 6e3 : 5e3) | 0;
								E = d + 36 | 0;
								c[E >> 2] = s;
								n = (l | 0) == 1104;
								e = j - s | 0;
								e = s + (n ? (e << 1 | 0) / 3 | 0 : (e * 3 | 0) / 5 | 0) | 0;
								s = (j << 2 | 0) / 5 | 0;
								q = (e | 0) > (s | 0);
								u = q ? s : e;
								c[E >> 2] = q ? s : e;
								E = c[d + 228 >> 2] | 0;
								if (E) {
									y = 1065353216;
									$a = 208;
									break
								}
								hb = +(j - u | 0);
								hb = hb / (hb + +(_(m, n ? 3e3 : 3600) | 0));
								y = (g[k >> 2] = hb < .8571428656578064 ? hb + .1428571492433548 : 1.0, c[k >> 2] | 0)
							}
						while (0);
						do
							if (($a | 0) == 208) {
								if (!(c[Ca >> 2] | 0)) break;
								if (c[Q >> 2] | 0) break;
								n = c[w >> 2] | 0;
								if ((n | 0) == 1101) {
									w = 13;
									G = 8.0e3
								} else {
									e = (n | 0) == 1102;
									w = e ? 15 : 17;
									G = e ? 12.0e3 : 16.0e3
								}
								j = c[Wa >> 2] | 0;
								I = 0.0;
								x = 0;
								while (1) {
									if ((x | 0) >= (j | 0)) break;
									v = x * 21 | 0;
									m = 0;
									while (1) {
										if ((m | 0) >= (w | 0)) break;
										H = +g[E + (v + m << 2) >> 2];
										do
											if (H < .5) {
												if (!(H > -2.0)) {
													H = -2.0;
													break
												}
												if (H > 0.0) $a = 219
											} else {
												H = .5;
												$a = 219
											}
										while (0);
										if (($a | 0) == 219) {
											$a = 0;
											H = H * .5
										}
										I = I + H;
										m = m + 1 | 0
									}
									x = x + 1 | 0
								}
								s = ~~(G * (I / +(w | 0) * +(j | 0) + .20000000298023224));
								e = (_(u, -2) | 0) / 3 | 0;
								e = (s | 0) > (e | 0) ? s : e;
								c[d + 36 >> 2] = u + ((n + -1104 | 0) >>> 0 < 2 ? (e * 3 | 0) / 5 | 0 : e);
								e = _(e, f) | 0;
								C = C + ((e | 0) / (c[_a >> 2] << 3 | 0) | 0) | 0
							}
						while (0);
						c[d + 32 >> 2] = (f * 1e3 | 0) / (c[_a >> 2] | 0) | 0;
						c[d + 8 >> 2] = c[Wa >> 2];
						c[d + 12 >> 2] = c[Aa >> 2];
						switch (l | 0) {
							case 1101:
								{
									c[d + 28 >> 2] = 8e3;E = 8e3;
									break
								}
							case 1102:
								{
									c[d + 28 >> 2] = 12e3;E = 12e3;
									break
								}
							default:
								{
									c[d + 28 >> 2] = 16e3;E = 16e3
								}
						}
						m = d + 24 | 0;
						do
							if (A) {
								c[m >> 2] = 16e3;
								$a = 234
							} else {
								c[m >> 2] = 8e3;
								if ((z | 0) != 1e3) {
									$a = 234;
									break
								}
								n = d + 20 | 0;
								c[n >> 2] = 16e3;
								m = V ? (da << 4 | 0) / 3 | 0 : ea;
								if ((m | 0) < 13e3) {
									c[n >> 2] = 12e3;
									E = E >>> 0 > 12e3 ? 12e3 : E;
									c[d + 28 >> 2] = E
								}
								if ((m | 0) >= 9600) break;
								c[n >> 2] = 8e3;
								c[d + 28 >> 2] = (E | 0) > 8e3 ? 8e3 : E
							}
						while (0);
						if (($a | 0) == 234) c[d + 20 >> 2] = 16e3;
						m = d + 56 | 0;
						c[m >> 2] = (c[Ca >> 2] | 0) == 0 & 1;
						E = W - ca | 0;
						E = (E | 0) > 1275 ? 1275 : E;
						c[ja >> 2] = E;
						n = d + 60 | 0;
						c[n >> 2] = E << 3;
						if ((c[xa >> 2] | 0) == 1001) c[n >> 2] = (E * 72 | 0) / 10 | 0;
						if (c[m >> 2] | 0) {
							e = d + 36 | 0;
							s = c[e >> 2] | 0;
							ea = _(s, f) | 0;
							c[n >> 2] = ((ea | 0) / (c[_a >> 2] << 3 | 0) | 0) << 3;
							s = s + -2e3 | 0;
							c[e >> 2] = (s | 0) < 1 ? 1 : s
						}
						if (!K) m = 0;
						else {
							c[ga >> 2] = 0;
							ea = c[Wa >> 2] | 0;
							e = c[_a >> 2] | 0;
							da = (e | 0) / 400 | 0;
							m = _(ea, (c[L >> 2] | 0) - (c[d + 104 >> 2] | 0) - da | 0) | 0;
							q = d + 252 + (m << 2) | 0;
							s = c[za >> 2] | 0;
							Jc(q, q, 0.0, 1.0, c[s + 4 >> 2] | 0, da, ea, c[s + 60 >> 2] | 0, e);
							id(d + 252 | 0, 0, m << 2 | 0) | 0;
							m = 0;
							while (1) {
								E = c[L >> 2] | 0;
								if ((m | 0) >= (_(E, c[Wa >> 2] | 0) | 0)) break;
								G = +g[d + 252 + (m << 2) >> 2] * 32768.0;
								if (G > -32768.0)
									if (G < 32767.0) $a = 244;
									else G = 32767.0;
								else {
									G = -32768.0;
									$a = 244
								}
								if (($a | 0) == 244) $a = 0;
								E = (g[k >> 2] = G, c[k >> 2] | 0);
								do
									if ((E & 2130706432) >>> 0 <= 1249902592) {
										E = (E | 0) < 0;
										G = E ? G + -8388608.0 + 8388608.0 : G + 8388608.0 + -8388608.0;
										if (!(G == 0.0)) break;
										G = E ? -0.0 : 0.0
									}
								while (0);
								b[J + (m << 1) >> 1] = ~~G;
								m = m + 1 | 0
							}
							Db(ia, d + 8 | 0, J, E, 0, ga, 1) | 0;
							m = 0
						}
						while (1) {
							E = c[Wa >> 2] | 0;
							if ((m | 0) >= (_(E, f) | 0)) break;
							G = +g[$ + ((_(va, E) | 0) + m << 2) >> 2] * 32768.0;
							if (G > -32768.0)
								if (G < 32767.0) $a = 253;
								else G = 32767.0;
							else {
								G = -32768.0;
								$a = 253
							}
							if (($a | 0) == 253) $a = 0;
							E = (g[k >> 2] = G, c[k >> 2] | 0);
							do
								if ((E & 2130706432) >>> 0 <= 1249902592) {
									E = (E | 0) < 0;
									G = E ? G + -8388608.0 + 8388608.0 : G + 8388608.0 + -8388608.0;
									if (!(G == 0.0)) break;
									G = E ? -0.0 : 0.0
								}
							while (0);
							b[J + (m << 1) >> 1] = ~~G;
							m = m + 1 | 0
						}
						u = Db(ia, d + 8 | 0, J, f, Ma, ja, 0) | 0;
						do
							if (!u) {
								if (!(c[ja >> 2] | 0)) {
									c[Va >> 2] = 0;
									a[h >> 0] = Ic(c[xa >> 2] | 0, (c[_a >> 2] | 0) / (f | 0) | 0, l, c[Aa >> 2] | 0) | 0;
									t = 1;
									break
								}
								do
									if ((c[xa >> 2] | 0) == 1e3) {
										E = c[d + 76 >> 2] | 0;
										if ((E | 0) == 8e3) {
											l = 1101;
											break
										}
										if ((E | 0) == 12e3) {
											l = 1102;
											break
										}
										l = (E | 0) == 16e3 ? 1103 : l
									}
								while (0);
								ga = c[d + 92 >> 2] | 0;
								c[d + 68 >> 2] = ga;
								if (!ga) E = ba;
								else {
									c[ha >> 2] = 1;
									E = 0;
									D = 1
								}
								ya(B | 0);
								m = y;
								z = E;
								y = l;
								J = D;
								$a = 269;
								break c
							} else t = -3;
						while (0);
						ya(B | 0)
					}
				while (0);
				d: do
					if (($a | 0) == 269) {
						switch (y | 0) {
							case 1101:
								{
									E = 13;
									break
								}
							case 1103:
							case 1102:
								{
									E = 17;
									break
								}
							case 1104:
								{
									E = 19;
									break
								}
							default:
								E = 21
						}
						c[pa >> 2] = E;
						Ya(Da, 10012, pa) | 0;
						c[qa >> 2] = c[Aa >> 2];
						Ya(Da, 10008, qa) | 0;
						c[la >> 2] = -1;
						Ya(Da, 4002, la) | 0;
						do
							if ((c[xa >> 2] | 0) == 1e3) {
								v = ((_(c[Wa >> 2] | 0, c[_a >> 2] | 0) | 0) / 400 | 0) << 2;
								w = i;
								i = i + ((1 * v | 0) + 15 & -16) | 0;
								v = 0
							} else {
								c[ma >> 2] = 0;
								Ya(Da, 4006, ma) | 0;
								c[oa >> 2] = (c[d + 72 >> 2] | 0) == 0 ? 2 : 0;
								Ya(Da, 10002, oa) | 0;
								do
									if ((c[xa >> 2] | 0) == 1001) {
										E = (c[r >> 2] | 0) + ((aa(c[p >> 2] | 0) | 0) + -32) + 7 >> 3;
										E = (J | 0) == 0 ? E : E + 3 | 0;
										if (!(c[Ca >> 2] | 0)) {
											C = (E | 0) > (C | 0) ? E : C;
											break
										} else {
											ga = _(c[d + 36 >> 2] | 0, f) | 0;
											C = E + C - ((ga | 0) / (c[_a >> 2] << 3 | 0) | 0) | 0;
											break
										}
									} else {
										if (!(c[Ca >> 2] | 0)) break;
										do
											if ((c[ka >> 2] | 0) == 5010) {
												E = c[_a >> 2] | 0;
												if (((E | 0) / 50 | 0 | 0) == (f | 0)) {
													E = 0;
													break
												}
												E = _(((c[Aa >> 2] | 0) * 60 | 0) + 40 | 0, ((E | 0) / (f | 0) | 0) + -50 | 0) | 0;
												if (!(c[Ea >> 2] | 0)) break;
												E = ~~(+(E | 0) * (+g[Ea + 4 >> 2] * .5 + 1.0))
											} else E = 0;
										while (0);
										c[ra >> 2] = 1;
										Ya(Da, 4006, ra) | 0;
										c[sa >> 2] = c[d + 140 >> 2];
										Ya(Da, 4020, sa) | 0;
										c[ta >> 2] = (c[Ba >> 2] | 0) + E;
										Ya(Da, 4002, ta) | 0;
										C = W - ca | 0
									}
								while (0);
								E = c[xa >> 2] | 0;
								ga = ((_(c[Wa >> 2] | 0, c[_a >> 2] | 0) | 0) / 400 | 0) << 2;
								D = i;
								i = i + ((1 * ga | 0) + 15 & -16) | 0;
								if ((E | 0) == 1e3) {
									w = D;
									v = C;
									break
								}
								ga = c[ua >> 2] | 0;
								if (!((E | 0) != (ga | 0) & (ga | 0) > 0)) {
									w = D;
									v = C;
									break
								}
								w = c[_a >> 2] | 0;
								v = c[Wa >> 2] | 0;
								nd(D | 0, d + 252 + ((_((c[L >> 2] | 0) - va - ((w | 0) / 400 | 0) | 0, v) | 0) << 2) | 0, ((_(v, w) | 0) / 400 | 0) << 2 | 0) | 0;
								w = D;
								v = C
							}
						while (0);
						C = c[Wa >> 2] | 0;
						E = c[L >> 2] | 0;
						D = d + 252 | 0;
						if ((_(C, E - P | 0) | 0) > 0) {
							ga = _(C, E - f - va | 0) | 0;
							od(D | 0, d + 252 + ((_(C, f) | 0) << 2) | 0, ga << 2 | 0) | 0;
							nd(d + 252 + (ga << 2) | 0, $ | 0, (_(P, C) | 0) << 2 | 0) | 0
						} else nd(D | 0, $ + ((_(P - E | 0, C) | 0) << 2) | 0, (_(E, C) | 0) << 2 | 0) | 0;
						E = d + 180 | 0;
						G = +g[E >> 2];
						F = (c[k >> 2] = m, +g[k >> 2]);
						if (G < 1.0 | F < 1.0) {
							ga = c[za >> 2] | 0;
							Jc($, $, G, F, c[ga + 4 >> 2] | 0, f, c[Wa >> 2] | 0, c[ga + 60 >> 2] | 0, c[_a >> 2] | 0)
						}
						c[E >> 2] = m;
						C = c[xa >> 2] | 0;
						if (!((C | 0) == 1001 ? (c[Aa >> 2] | 0) != 1 : 0)) {
							do
								if ((fa | 0) < 3e4) {
									E = 0;
									$a = 298
								} else {
									if (((fa << 1) + -6e4 | 0) > 16384) {
										E = 16384;
										break
									}
									E = fa + -3e4 | 0;
									$a = 298
								}
							while (0);
							if (($a | 0) == 298) E = E << 1;
							c[d + 88 >> 2] = E
						}
						do
							if (!(c[d + 228 >> 2] | 0)) {
								if ((c[Wa >> 2] | 0) != 2) {
									E = C;
									break
								}
								j = d + 172 | 0;
								E = b[j >> 1] | 0;
								n = d + 88 | 0;
								D = c[n >> 2] | 0;
								if (!(E << 16 >> 16 < 16384 | (D | 0) < 16384)) {
									E = C;
									break
								}
								C = c[za >> 2] | 0;
								l = 48e3 / (c[_a >> 2] | 0) | 0;
								m = (c[C + 4 >> 2] | 0) / (l | 0) | 0;
								G = 1.0 - +(E << 16 >> 16) * .00006103515625;
								F = 1.0 - +(D | 0) * .00006103515625;
								E = c[C + 60 >> 2] | 0;
								D = (m | 0) > 0;
								C = 0;
								while (1) {
									if ((C | 0) >= (m | 0)) break;
									hb = +g[E + ((_(C, l) | 0) << 2) >> 2];
									hb = hb * hb;
									ga = C << 1;
									fa = $ + (ga << 2) | 0;
									eb = +g[fa >> 2];
									ga = $ + ((ga | 1) << 2) | 0;
									fb = +g[ga >> 2];
									hb = (hb * F + (1.0 - hb) * G) * ((eb - fb) * .5);
									g[fa >> 2] = eb - hb;
									g[ga >> 2] = fb + hb;
									C = C + 1 | 0
								}
								E = D ? m : 0;
								while (1) {
									if ((E | 0) >= (f | 0)) break;
									ga = E << 1;
									fa = $ + (ga << 2) | 0;
									eb = +g[fa >> 2];
									ga = $ + ((ga | 1) << 2) | 0;
									fb = +g[ga >> 2];
									hb = F * ((eb - fb) * .5);
									g[fa >> 2] = eb - hb;
									g[ga >> 2] = fb + hb;
									E = E + 1 | 0
								}
								b[j >> 1] = c[n >> 2];
								E = c[xa >> 2] | 0
							} else E = C;
						while (0);
						e: do
							if ((E | 0) == 1002) $a = 331;
							else {
								C = c[p >> 2] | 0;
								D = (c[r >> 2] | 0) + ((aa(C | 0) | 0) + -32) | 0;
								E = (E | 0) == 1001;
								if ((D + 17 + (E ? 20 : 0) | 0) > ((t << 3) + -8 | 0)) {
									$a = 331;
									break
								}
								f: do
									if (E) {
										if (!J) {
											if ((D + 37 | 0) > (v << 3 | 0)) {
												$a = 331;
												break e
											}
											l = Ma + 32 | 0;
											E = C - (C >>> 12) | 0
										} else {
											E = C >>> 12;
											l = Ma + 32 | 0;
											c[l >> 2] = (c[T >> 2] | 0) + (C - E)
										}
										D = Ma + 28 | 0;
										c[D >> 2] = E;
										C = Ma + 20 | 0;
										while (1) {
											if (E >>> 0 >= 8388609) break f;
											lb(Ma, (c[l >> 2] | 0) >>> 23);
											c[l >> 2] = c[l >> 2] << 8 & 2147483392;
											E = c[D >> 2] << 8;
											c[D >> 2] = E;
											c[C >> 2] = (c[C >> 2] | 0) + 8
										}
									}
								while (0);
								if (!J) {
									$a = 331;
									break
								}
								D = c[p >> 2] | 0;
								E = D >>> 1;
								D = D - E | 0;
								if (!z) {
									l = Ma + 32 | 0;
									E = D
								} else {
									l = Ma + 32 | 0;
									c[l >> 2] = (c[T >> 2] | 0) + D
								}
								D = Ma + 28 | 0;
								c[D >> 2] = E;
								C = Ma + 20 | 0;
								while (1) {
									if (E >>> 0 >= 8388609) break;
									lb(Ma, (c[l >> 2] | 0) >>> 23);
									c[l >> 2] = c[l >> 2] << 8 & 2147483392;
									E = c[D >> 2] << 8;
									c[D >> 2] = E;
									c[C >> 2] = (c[C >> 2] | 0) + 8
								}
								D = (c[xa >> 2] | 0) == 1001;
								if (D) E = v;
								else E = (c[r >> 2] | 0) + ((aa(c[p >> 2] | 0) | 0) + -32) + 7 >> 3;
								ga = W - E | 0;
								E = (c[Ba >> 2] | 0) / 1600 | 0;
								E = (ga | 0) < (E | 0) ? ga : E;
								E = (E | 0) < 2 ? 2 : (E | 0) > 257 ? 257 : E;
								if (!D) {
									D = J;
									l = E;
									break
								}
								gb(Ma, E + -2 | 0, E + -1 | 0, 256);
								D = J;
								l = E
							}
						while (0);
						if (($a | 0) == 331) {
							c[ha >> 2] = 0;
							D = 0;
							l = 0
						}
						E = c[xa >> 2] | 0;
						do
							if ((E | 0) == 1002) {
								E = 0;
								$a = 335
							} else {
								if ((E | 0) != 1e3) {
									E = 17;
									$a = 335;
									break
								}
								u = (c[r >> 2] | 0) + ((aa(c[p >> 2] | 0) | 0) + -32) + 7 >> 3;
								kb(Ma);
								C = u;
								E = 17
							}
						while (0);
						if (($a | 0) == 335) {
							C = W - l | 0;
							C = (C | 0) < (v | 0) ? C : v;
							fa = c[Ma >> 2] | 0;
							ga = c[S >> 2] | 0;
							od(fa + (C - ga) | 0, fa + ((c[R >> 2] | 0) - ga) | 0, ga | 0) | 0;
							c[R >> 2] = C
						}
						D = (D | 0) == 0;
						do
							if (D) {
								if ((c[xa >> 2] | 0) == 1e3) break;
								c[Fa >> 2] = Ea;
								Ya(Da, 10022, Fa) | 0
							} else {
								c[Ga >> 2] = Ea;
								Ya(Da, 10022, Ga) | 0;
								if (!z) break;
								c[Ha >> 2] = 0;
								Ya(Da, 10010, Ha) | 0;
								c[Ia >> 2] = 0;
								Ya(Da, 4006, Ia) | 0;
								if ((Xa(Da, $, (c[_a >> 2] | 0) / 200 | 0, h + (C + 1) | 0, l, 0) | 0) < 0) {
									t = -3;
									break d
								}
								c[Ja >> 2] = Qa;
								Ya(Da, 4031, Ja) | 0;
								Ya(Da, 4028, Ka) | 0
							}
						while (0);
						c[Za >> 2] = E;
						Ya(Da, 10010, Za) | 0;
						x = c[xa >> 2] | 0;
						do
							if ((x | 0) != 1e3) {
								ga = c[ua >> 2] | 0;
								if ((x | 0) != (ga | 0) & (ga | 0) > 0) {
									Ya(Da, 4028, Na) | 0;
									Xa(Da, w, (c[_a >> 2] | 0) / 400 | 0, La, 2, 0) | 0;
									c[Oa >> 2] = 0;
									Ya(Da, 10002, Oa) | 0
								}
								if (((c[r >> 2] | 0) + ((aa(c[p >> 2] | 0) | 0) + -32) | 0) > (C << 3 | 0)) break;
								u = Xa(Da, $, f, 0, C, Ma) | 0;
								if ((u | 0) < 0) {
									t = -3;
									break d
								}
							}
						while (0);
						if ((D ^ 1) & (z | 0) == 0) {
							e = c[_a >> 2] | 0;
							ga = (e | 0) / 200 | 0;
							e = (e | 0) / 400 | 0;
							Ya(Da, 4028, Ra) | 0;
							c[Sa >> 2] = 0;
							Ya(Da, 10010, Sa) | 0;
							c[Ta >> 2] = 0;
							Ya(Da, 10002, Ta) | 0;
							fa = f - ga | 0;
							Xa(Da, $ + ((_(c[Wa >> 2] | 0, fa - e | 0) | 0) << 2) | 0, e, Pa, 2, 0) | 0;
							if ((Xa(Da, $ + ((_(c[Wa >> 2] | 0, fa) | 0) << 2) | 0, ga, h + (C + 1) | 0, l, 0) | 0) < 0) {
								t = -3;
								break
							}
							c[Ua >> 2] = Qa;
							Ya(Da, 4031, Ua) | 0
						}
						a[h >> 0] = Ic(c[xa >> 2] | 0, (c[_a >> 2] | 0) / (f | 0) | 0, y, c[Aa >> 2] | 0) | 0;
						c[Va >> 2] = c[p >> 2] ^ c[Qa >> 2];
						if (!wa) j = c[xa >> 2] | 0;
						else j = 1002;
						c[ua >> 2] = j;
						c[d + 208 >> 2] = c[Aa >> 2];
						c[d + 212 >> 2] = f;
						c[d + 224 >> 2] = 0;
						g: do
							if (((c[r >> 2] | 0) + ((aa(c[p >> 2] | 0) | 0) + -32) | 0) > ((t << 3) + -8 | 0)) {
								if ((t | 0) < 2) {
									t = -2;
									break d
								}
								a[h + 1 >> 0] = 0;
								c[Va >> 2] = 0;
								u = 1
							} else {
								if ((c[xa >> 2] | 0) == 1e3 ^ 1 | D ^ 1) break;
								while (1) {
									if ((u | 0) <= 2) break g;
									if (a[h + u >> 0] | 0) break g;
									u = u + -1 | 0
								}
							}
						while (0);
						u = u + (l + 1) | 0;
						h: do
							if (!(c[Ca >> 2] | 0)) {
								i: do
									if ((u | 0) >= 1) {
										do
											if ((t | 0) != (u | 0)) {
												if ((t | 0) < (u | 0)) break i;
												ga = Za + 4 | 0;
												c[ga >> 2] = 0;
												fa = h + (t - u) | 0;
												od(fa | 0, h | 0, u | 0) | 0;
												Mc(Za, fa, u) | 0;
												u = Nc(Za, c[ga >> 2] | 0, h, t, 1) | 0;
												if ((u | 0) > 0) break;
												if (!u) break h;
												else {
													t = -3;
													break d
												}
											}
										while (0);
										break h
									}while (0);t = -3;
								break d
							}
							else t = u;
						while (0)
					}
				while (0);
				ya(o | 0);
				ga = t;
				i = ab;
				return ga | 0
			}
		while (0);
		t = c[d + 200 >> 2] | 0;
		j = c[d + 216 >> 2] | 0;
		j = (j | 0) == 0 ? 1101 : j;
		do
			if ((X | 0) <= 100) {
				if ((X | 0) >= 50 ? (u = (t | 0) == 0 ? 1e3 : t, (u | 0) != 1e3) : 0)
					if ((u | 0) == 1002) {
						$a = 49;
						break
					} else {
						$a = 50;
						break
					}
				if ((j | 0) > 1103) {
					t = 1103;
					u = 1e3
				} else {
					u = 1e3;
					$a = 51
				}
			} else {
				u = 1002;
				$a = 49
			}
		while (0);
		if (($a | 0) == 49)
			if ((j | 0) == 1102) t = 1101;
			else $a = 50;
		if (($a | 0) == 50)
			if ((j | 0) < 1105) $a = 51;
			else t = j;
		if (($a | 0) == 51) t = 1104;
		a[h >> 0] = Ic(u, X, t, c[d + 168 >> 2] | 0) | 0;
		ga = 1;
		i = ab;
		return ga | 0
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
			o = 0;
		if ((c[a + 96 >> 2] | 0) == 2051) l = 0;
		else l = c[a + 104 >> 2] | 0;
		j = c[a + 144 >> 2] | 0;
		o = a + 100 | 0;
		k = c[o >> 2] | 0;
		m = c[a + 132 >> 2] | 0;
		h = c[a + 148 >> 2] | 0;
		g = a + 10960 | 0;
		i = (j | 0) == 5010;
		a: do
			if (i ^ 1 | ((m | 0) / 200 | 0 | 0) > (d | 0)) {
				h = (m | 0) / 400 | 0;
				if ((h | 0) <= (d | 0)) {
					if ((j | 0) != 5e3) {
						if (i) g = (m | 0) / 50 | 0;
						else {
							if (!((j | 0) > 5e3 & (j | 0) < 5007)) {
								g = -1;
								break
							}
							l = (m * 3 | 0) / 50 | 0;
							g = h << j + -5001;
							g = (l | 0) < (g | 0) ? l : g
						}
						if ((g | 0) > (d | 0)) {
							g = -1;
							break
						}
					} else g = d;
					if (!((g * 400 | 0) == (m | 0) | (g * 200 | 0) == (m | 0) | (g * 100 | 0) == (m | 0)) ? (l = g * 50 | 0, !((l | 0) == (m | 0) | (g * 25 | 0) == (m | 0) | (l | 0) == (m * 3 | 0))) : 0) g = -1;
					else n = 16
				} else g = -1
			} else {
				i = (m | 0) / 400 | 0;
				h = Hc(b, d, k, m, h, g, l, 1) | 0;
				while (1) {
					g = i << h;
					if ((g | 0) <= (d | 0)) {
						n = 16;
						break a
					}
					h = h + -1 | 0
				}
			}
		while (0);
		if ((n | 0) == 16) g = (g | 0) < 0 ? -1 : g;
		return Dc(a, b, g, e, f, 24, b, d, 0, -2, c[o >> 2] | 0, 1, 1) | 0
	}

	function Fc(a, d, e) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			h = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0,
			q = 0;
		q = i;
		i = i + 160 | 0;
		m = q + 48 | 0;
		k = q + 40 | 0;
		j = q + 32 | 0;
		h = q + 24 | 0;
		o = q + 16 | 0;
		n = q + 8 | 0;
		l = q;
		p = q + 144 | 0;
		f = q + 56 | 0;
		c[p >> 2] = e;
		e = a + (c[a >> 2] | 0) | 0;
		a: do switch (d | 0) {
				case 4e3:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						switch (f | 0) {
							case 2051:
							case 2049:
							case 2048:
								break;
							default:
								{
									d = -1;f = 104;
									break a
								}
						}
						d = a + 96 | 0;
						if ((c[a + 224 >> 2] | 0) == 0 ? (c[d >> 2] | 0) != (f | 0) : 0) {
							d = -1;
							f = 104;
							break a
						}
						c[d >> 2] = f;d = 0;f = 104;
						break
					}
				case 4001:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 96 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4002:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) != -1e3)
							if ((f | 0) != -1) {
								if ((f | 0) < 1) {
									f = 105;
									break a
								}
								if ((f | 0) < 501) d = 500;
								else {
									d = (c[a + 100 >> 2] | 0) * 3e5 | 0;
									d = (f | 0) > (d | 0) ? d : f
								}
							} else d = -1;
						else d = -1e3;c[a + 152 >> 2] = d;d = 0;f = 104;
						break
					}
				case 4003:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);e = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!e) f = 105;
						else {
							f = c[a + 212 >> 2] | 0;
							if (!f) f = (c[a + 132 >> 2] | 0) / 400 | 0;
							d = c[a + 152 >> 2] | 0;
							switch (d | 0) {
								case -1e3:
									{
										d = c[a + 132 >> 2] | 0;d = ((d * 60 | 0) / (f | 0) | 0) + (_(d, c[a + 100 >> 2] | 0) | 0) | 0;
										break
									}
								case -1:
									{
										d = ((c[a + 132 >> 2] | 0) * 10208 | 0) / (f | 0) | 0;
										break
									}
								default:
									{}
							}
							c[e >> 2] = d;
							d = 0;
							f = 104
						}
						break
					}
				case 4022:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 1) {
							if ((f | 0) != -1e3) {
								f = 105;
								break a
							}
						} else if ((f | 0) > (c[a + 100 >> 2] | 0)) {
							f = 105;
							break a
						}
						c[a + 108 >> 2] = f;d = 0;f = 104;
						break
					}
				case 4023:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 108 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4004:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 1101 | (f | 0) > 1105) f = 105;
						else {
							c[a + 120 >> 2] = f;
							switch (f | 0) {
								case 1101:
									{
										c[a + 20 >> 2] = 8e3;d = 0;f = 104;
										break a
									}
								case 1102:
									{
										c[a + 20 >> 2] = 12e3;d = 0;f = 104;
										break a
									}
								default:
									{
										c[a + 20 >> 2] = 16e3;d = 0;f = 104;
										break a
									}
							}
						}
						break
					}
				case 4005:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 120 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4008:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;b: do
							if ((f | 0) < 1101) {
								if ((f | 0) != -1e3) {
									f = 105;
									break a
								}
								c[a + 116 >> 2] = f
							} else {
								if ((f | 0) > 1105) {
									f = 105;
									break a
								}
								c[a + 116 >> 2] = f;
								switch (f | 0) {
									case 1101:
										{
											c[a + 20 >> 2] = 8e3;d = 0;f = 104;
											break a
										}
									case 1102:
										{
											c[a + 20 >> 2] = 12e3;d = 0;f = 104;
											break a
										}
									default:
										break b
								}
							}while (0);c[a + 20 >> 2] = 16e3;d = 0;f = 104;
						break
					}
				case 4009:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 216 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4016:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 0 | (f | 0) > 1) f = 105;
						else {
							c[a + 52 >> 2] = f;
							d = 0;
							f = 104
						}
						break
					}
				case 4017:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 52 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4010:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 0 | (f | 0) > 10) f = 105;
						else {
							c[a + 44 >> 2] = f;
							c[l >> 2] = f;
							Ya(e, 4010, l) | 0;
							d = 0;
							f = 104
						}
						break
					}
				case 4011:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 44 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4012:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 0 | (f | 0) > 1) f = 105;
						else {
							c[a + 48 >> 2] = f;
							d = 0;
							f = 104
						}
						break
					}
				case 4013:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 48 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4014:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 0 | (f | 0) > 100) f = 105;
						else {
							c[a + 40 >> 2] = f;
							c[n >> 2] = f;
							Ya(e, 4014, n) | 0;
							d = 0;
							f = 104
						}
						break
					}
				case 4015:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 40 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4006:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 0 | (f | 0) > 1) f = 105;
						else {
							c[a + 136 >> 2] = f;
							c[a + 56 >> 2] = 1 - f;
							d = 0;
							f = 104
						}
						break
					}
				case 4007:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 136 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 11018:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < -1 | (f | 0) > 100) f = 105;
						else {
							c[a + 128 >> 2] = f;
							d = 0;
							f = 104
						}
						break
					}
				case 11019:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 128 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4020:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 0 | (f | 0) > 1) f = 105;
						else {
							c[a + 140 >> 2] = f;
							d = 0;
							f = 104
						}
						break
					}
				case 4021:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 140 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4024:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 3001) switch (f | 0) {
							case -1e3:
								break;
							default:
								{
									f = 105;
									break a
								}
						} else switch (f | 0) {
							case 3002:
							case 3001:
								break;
							default:
								{
									f = 105;
									break a
								}
						}
						c[a + 112 >> 2] = f;d = 0;f = 104;
						break
					}
				case 4025:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 112 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4027:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);d = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (d) {
							f = (c[a + 132 >> 2] | 0) / 400 | 0;
							c[d >> 2] = f;
							if ((c[a + 96 >> 2] | 0) == 2051) {
								d = 0;
								f = 104
							} else {
								c[d >> 2] = f + (c[a + 104 >> 2] | 0);
								d = 0;
								f = 104
							}
						} else f = 105;
						break
					}
				case 4029:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 132 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4031:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 18212 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4036:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 8 | (f | 0) > 24) f = 105;
						else {
							c[a + 156 >> 2] = f;
							d = 0;
							f = 104
						}
						break
					}
				case 4037:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 156 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4040:
					{
						n = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[n >> 2] | 0;c[p >> 2] = n + 4;
						switch (f | 0) {
							case 5010:
							case 5006:
							case 5005:
							case 5004:
							case 5003:
							case 5002:
							case 5001:
							case 5e3:
								break;
							default:
								{
									f = 105;
									break a
								}
						}
						c[a + 144 >> 2] = f;c[o >> 2] = f;Ya(e, 4040, o) | 0;d = 0;f = 104;
						break
					}
				case 4041:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 144 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4042:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) > 1 | (f | 0) < 0) f = 105;
						else {
							c[a + 72 >> 2] = f;
							d = 0;
							f = 104
						}
						break
					}
				case 4043:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[f >> 2] = c[a + 72 >> 2];
							d = 0;
							f = 104
						}
						break
					}
				case 4028:
					{
						d = a + (c[a + 4 >> 2] | 0) | 0;id(a + 168 | 0, 0, 18052) | 0;Ya(e, 4028, h) | 0;Cb(d, c[a + 18216 >> 2] | 0, f) | 0;c[a + 168 >> 2] = c[a + 100 >> 2];b[a + 172 >> 1] = 16384;g[a + 180 >> 2] = 1.0;c[a + 224 >> 2] = 1;c[a + 200 >> 2] = 1001;c[a + 216 >> 2] = 1105;c[a + 176 >> 2] = (Wb(60) | 0) << 8;d = 0;f = 104;
						break
					}
				case 11002:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if ((f | 0) < 1e3) {
							if ((f | 0) != -1e3) {
								f = 105;
								break a
							}
						} else if ((f | 0) > 1002) {
							f = 105;
							break a
						}
						c[a + 124 >> 2] = f;d = 0;f = 104;
						break
					}
				case 10024:
					{
						f = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);d = c[f >> 2] | 0;c[p >> 2] = f + 4;c[a + 164 >> 2] = d;c[j >> 2] = d;d = Ya(e, 10024, j) | 0;f = 104;
						break
					}
				case 10026:
					{
						f = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);d = c[f >> 2] | 0;c[p >> 2] = f + 4;c[a + 228 >> 2] = d;c[k >> 2] = d;d = Ya(e, 10026, k) | 0;f = 104;
						break
					}
				case 10015:
					{
						o = (c[p >> 2] | 0) + (4 - 1) & ~(4 - 1);f = c[o >> 2] | 0;c[p >> 2] = o + 4;
						if (!f) f = 105;
						else {
							c[m >> 2] = f;
							d = Ya(e, 10015, m) | 0;
							f = 104
						}
						break
					}
				default:
					{
						d = -5;f = 104
					}
			}
			while (0);
			if ((f | 0) == 104) {
				o = d;
				i = q;
				return o | 0
			} else
		if ((f | 0) == 105) {
			o = -1;
			i = q;
			return o | 0
		}
		return 0
	}

	function Gc(a) {
		a = a | 0;
		bd(a);
		return
	}

	function Hc(a, b, d, e, f, h, j, l) {
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
			u = 0.0,
			v = 0,
			w = 0.0,
			x = 0,
			y = 0,
			z = 0,
			A = 0,
			B = 0,
			C = 0,
			D = 0,
			E = 0;
		E = i;
		i = i + 3296 | 0;
		A = E + 1760 | 0;
		C = E + 224 | 0;
		D = E + 112 | 0;
		z = E;
		s = (e | 0) / 400 | 0;
		t = i;
		i = i + ((1 * (s << 2) | 0) + 15 & -16) | 0;
		B = c[h >> 2] | 0;
		c[D >> 2] = B;
		g[z >> 2] = 1.0 / ((c[k >> 2] = B, +g[k >> 2]) + 1.0000000036274937e-15);
		B = (j | 0) == 0;
		if (B) {
			q = 0;
			r = 1
		} else {
			q = (s << 1) - j | 0;
			r = c[h + 4 >> 2] | 0;
			c[D + 4 >> 2] = r;
			g[z + 4 >> 2] = 1.0 / ((c[k >> 2] = r, +g[k >> 2]) + 1.0000000036274937e-15);
			r = c[h + 8 >> 2] | 0;
			c[D + 8 >> 2] = r;
			g[z + 8 >> 2] = 1.0 / ((c[k >> 2] = r, +g[k >> 2]) + 1.0000000036274937e-15);
			b = b - q | 0;
			r = 3
		}
		n = (b | 0) / (s | 0) | 0;
		n = (n | 0) < 24 ? n : 24;
		o = (n | 0) > 0;
		b = 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (n | 0)) break;
			j = (_(m, s) | 0) + q | 0;
			Ca[l & 1](a, t, s, j, 0, -2, d);
			b = (m | 0) == 0 ? c[t >> 2] | 0 : b;
			j = 0;
			e = 646978941;
			while (1) {
				if ((j | 0) >= (s | 0)) break;
				y = c[t + (j << 2) >> 2] | 0;
				p = (c[k >> 2] = y, +g[k >> 2]);
				p = p - (c[k >> 2] = b, +g[k >> 2]);
				b = y;
				j = j + 1 | 0;
				e = (g[k >> 2] = (c[k >> 2] = e, +g[k >> 2]) + p * p, c[k >> 2] | 0)
			}
			y = m + r | 0;
			c[D + (y << 2) >> 2] = e;
			g[z + (y << 2) >> 2] = 1.0 / (c[k >> 2] = e, +g[k >> 2]);
			m = m + 1 | 0
		}
		y = (o ? n : 0) + r | 0;
		c[D + (y << 2) >> 2] = c[D + (y + -1 << 2) >> 2];
		if (!B) {
			n = n + 2 | 0;
			n = (n | 0) > 24 ? 24 : n
		}
		x = ~~+((d * 60 | 0) + 40 | 0);
		y = (f | 0) / 400 | 0;
		if ((f | 0) >= 32e3)
			if ((f | 0) > 64399) w = 1.0;
			else w = +(y + -80 | 0) / 80.0;
		else w = 0.0;
		o = 0;
		while (1) {
			if ((o | 0) == 16) break;
			c[C + (o << 2) >> 2] = -1;
			g[A + (o << 2) >> 2] = 1.0e10;
			o = o + 1 | 0
		}
		e = n + 1 | 0;
		j = 0;
		while (1) {
			if ((j | 0) == 4) {
				v = 1;
				break
			}
			v = 1 << j;
			g[A + (v << 2) >> 2] = +(x + (y << j) | 0) * (w * +Lc(D, z, j, e) + 1.0);
			c[C + (v << 2) >> 2] = j;
			j = j + 1 | 0
		}
		while (1) {
			if ((n | 0) <= (v | 0)) break;
			q = v + -1 | 0;
			b = 2;
			while (1) {
				if ((b | 0) == 16) break;
				f = b + -1 | 0;
				c[A + (v << 6) + (b << 2) >> 2] = c[A + (q << 6) + (f << 2) >> 2];
				c[C + (v << 6) + (b << 2) >> 2] = f;
				b = b + 1 | 0
			}
			f = A + (q << 6) + 4 | 0;
			l = D + (v << 2) | 0;
			m = z + (v << 2) | 0;
			o = n - v | 0;
			e = o + 1 | 0;
			u = +(o | 0);
			b = 0;
			while (1) {
				if ((b | 0) == 4) break;
				d = 1 << b;
				a = C + (v << 6) + (d << 2) | 0;
				c[a >> 2] = 1;
				j = c[f >> 2] | 0;
				r = 1;
				while (1) {
					if ((r | 0) == 4) break;
					r = r + 1 | 0;
					s = (1 << r) + -1 | 0;
					t = c[A + (q << 6) + (s << 2) >> 2] | 0;
					p = (c[k >> 2] = t, +g[k >> 2]);
					if (!(p < (c[k >> 2] = j, +g[k >> 2]))) continue;
					c[a >> 2] = s;
					j = t
				}
				p = +(x + (y << b) | 0) * (w * +Lc(l, m, b, e) + 1.0);
				t = A + (v << 6) + (d << 2) | 0;
				c[t >> 2] = j;
				if ((o | 0) < (d | 0)) p = p * u / +(d | 0);
				g[t >> 2] = (c[k >> 2] = j, +g[k >> 2]) + p;
				b = b + 1 | 0
			}
			v = v + 1 | 0
		}
		m = n + -1 | 0;
		j = c[A + (m << 6) + 4 >> 2] | 0;
		o = 1;
		b = 2;
		while (1) {
			if ((b | 0) == 16) break;
			p = +g[A + (m << 6) + (b << 2) >> 2];
			e = p < (c[k >> 2] = j, +g[k >> 2]);
			j = e ? (g[k >> 2] = p, c[k >> 2] | 0) : j;
			o = e ? b : o;
			b = b + 1 | 0
		}
		while (1) {
			m = n + -1 | 0;
			if ((n | 0) <= 0) break;
			n = m;
			o = c[C + (m << 6) + (o << 2) >> 2] | 0
		}
		m = 1 << o;
		c[h >> 2] = c[D + (m << 2) >> 2];
		if (B) {
			i = E;
			return o | 0
		}
		c[h + 4 >> 2] = c[D + (m + 1 << 2) >> 2];
		c[h + 8 >> 2] = c[D + (m + 2 << 2) >> 2];
		i = E;
		return o | 0
	}

	function Ic(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0;
		e = 0;
		while (1) {
			if ((b | 0) >= 400) break;
			b = b << 1;
			e = e + 1 | 0
		}
		switch (a | 0) {
			case 1e3:
				{
					b = (c << 5) + 96 & 224 | (e << 3) + -16;
					break
				}
			case 1002:
				{
					b = ((c | 0) < 1102 ? 0 : c + -1102 | 0) << 5 & 96 | e << 3 | 128;
					break
				}
			default:
				b = c << 4 | (e << 3) + 240 | 96
		}
		return (b | ((d | 0) == 2 & 1) << 2) & 255 | 0
	}

	function Jc(a, b, c, d, e, f, h, i, j) {
		a = a | 0;
		b = b | 0;
		c = +c;
		d = +d;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		j = j | 0;
		var k = 0,
			l = 0,
			m = 0.0;
		k = 48e3 / (j | 0) | 0;
		l = (e | 0) / (k | 0) | 0;
		a: do
			if ((h | 0) == 1) {
				j = 0;
				while (1) {
					if ((j | 0) >= (l | 0)) {
						e = 0;
						break a
					}
					m = +g[i + ((_(j, k) | 0) << 2) >> 2];
					m = m * m;
					g[b + (j << 2) >> 2] = (m * d + (1.0 - m) * c) * +g[a + (j << 2) >> 2];
					j = j + 1 | 0
				}
			} else {
				j = 0;
				while (1) {
					if ((j | 0) >= (l | 0)) {
						e = 0;
						break a
					}
					m = +g[i + ((_(j, k) | 0) << 2) >> 2];
					m = m * m;
					m = m * d + (1.0 - m) * c;
					e = j << 1;
					g[b + (e << 2) >> 2] = m * +g[a + (e << 2) >> 2];
					e = e | 1;
					g[b + (e << 2) >> 2] = m * +g[a + (e << 2) >> 2];
					j = j + 1 | 0
				}
			}
		while (0);
		do {
			j = l;
			while (1) {
				if ((j | 0) >= (f | 0)) break;
				k = (_(j, h) | 0) + e | 0;
				g[b + (k << 2) >> 2] = +g[a + (k << 2) >> 2] * d;
				j = j + 1 | 0
			}
			e = e + 1 | 0
		} while ((e | 0) < (h | 0));
		return
	}

	function Kc(a, b, d, e, f, h, i) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		h = h | 0;
		i = i | 0;
		var j = 0.0,
			k = 0.0,
			l = 0.0,
			m = 0.0,
			n = 0.0,
			o = 0,
			p = 0.0,
			q = 0.0;
		n = +(c[d >> 2] | 0) * 3.725290298461914e-09;
		l = +(c[d + 4 >> 2] | 0) * 3.725290298461914e-09;
		m = +(c[b >> 2] | 0) * 3.725290298461914e-09;
		k = +(c[b + 4 >> 2] | 0) * 3.725290298461914e-09;
		j = +(c[b + 8 >> 2] | 0) * 3.725290298461914e-09;
		b = e + 4 | 0;
		d = 0;
		while (1) {
			if ((d | 0) >= (h | 0)) break;
			o = _(d, i) | 0;
			q = +g[a + (o << 2) >> 2];
			p = +g[e >> 2] + m * q;
			g[e >> 2] = +g[b >> 2] - p * n + k * q;
			g[b >> 2] = j * q - p * l + 1.0000000031710769e-30;
			g[f + (o << 2) >> 2] = p;
			d = d + 1 | 0
		}
		return
	}

	function Lc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0.0,
			f = 0.0,
			h = 0.0,
			i = 0.0;
		c = 1 << c;
		d = (c | 0) < (d | 0) ? c + 1 | 0 : d;
		c = 0;
		e = 0.0;
		f = 0.0;
		while (1) {
			if ((c | 0) >= (d | 0)) break;
			i = e + +g[a + (c << 2) >> 2];
			h = f + +g[b + (c << 2) >> 2];
			c = c + 1 | 0;
			e = i;
			f = h
		}
		e = (e * f / +(_(d, d) | 0) + -2.0) * .05000000074505806;
		c = e < 0.0;
		if (+O(+(c ? 0.0 : e)) > 1.0) {
			e = 1.0;
			return +e
		}
		e = +O(+(c ? 0.0 : e));
		return +e
	}

	function Mc(e, f, g) {
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
		if ((g | 0) < 1) {
			p = -4;
			return p | 0
		}
		z = e + 4 | 0;
		y = c[z >> 2] | 0;
		if (y) {
			if (((a[e >> 0] ^ a[f >> 0]) & 255) >= 4) {
				p = -4;
				return p | 0
			}
		} else {
			a[e >> 0] = a[f >> 0] | 0;
			c[e + 296 >> 2] = zc(f, 8e3) | 0
		}
		j = d[f >> 0] & 3;
		if (j)
			if ((j | 0) == 3) {
				if ((g | 0) < 2) {
					p = -4;
					return p | 0
				}
				j = d[f + 1 >> 0] & 63;
				if ((j | 0) < 1) {
					p = -4;
					return p | 0
				} else x = j
			} else x = 2;
		else x = 1;
		if ((_(x + y | 0, c[e + 296 >> 2] | 0) | 0) > 960) {
			p = -4;
			return p | 0
		}
		m = e + 200 + (y << 1) | 0;
		p = zc(f, 48e3) | 0;
		j = f + 1 | 0;
		n = j;
		o = g + -1 | 0;
		a: do switch (d[f >> 0] & 3 | 0) {
				case 0:
					{
						i = n;h = 1;k = o;
						break
					}
				case 1:
					if (!(o & 1)) {
						k = (o | 0) / 2 | 0;
						b[m >> 1] = k;
						i = n;
						h = 2;
						break a
					} else {
						p = -4;
						return p | 0
					}
				case 2:
					{
						if ((g | 0) < 2) {
							b[m >> 1] = -1;
							p = -4;
							return p | 0
						}
						j = a[j >> 0] | 0;do
							if ((j & 255) < 252) {
								j = j & 255;
								b[m >> 1] = j;
								i = 1
							} else {
								if ((g | 0) >= 3) {
									j = (d[f + 2 >> 0] << 2) + (j & 255) & 65535;
									b[m >> 1] = j;
									i = 2;
									break
								}
								b[m >> 1] = -1;
								p = -4;
								return p | 0
							}
						while (0);
						k = o - i | 0;j = j << 16 >> 16;
						if ((k | 0) < (j | 0)) {
							p = -4;
							return p | 0
						} else {
							i = f + (i + 1) | 0;
							h = 2;
							k = k - j | 0;
							break a
						}
					}
				default:
					{
						if ((g | 0) < 2) {
							p = -4;
							return p | 0
						}
						l = f + 2 | 0;f = a[j >> 0] | 0;u = f & 63;
						if ((u | 0) == 0 | (_(p, u) | 0) > 5760) {
							p = -4;
							return p | 0
						}
						j = g + -2 | 0;
						if (f & 64) {
							while (1) {
								if ((j | 0) < 1) {
									v = -4;
									t = 52;
									break
								}
								q = l;
								s = q + 1 | 0;
								q = a[q >> 0] | 0;
								r = j + -1 | 0;
								if (q << 24 >> 24 != -1) break;
								j = r - 254 | 0;
								l = s
							}
							if ((t | 0) == 52) return v | 0;
							j = r - (q & 255) | 0;
							if ((j | 0) < 0) {
								p = -4;
								return p | 0
							} else l = s
						}
						if (f << 24 >> 24 >= 0) {
							k = (j | 0) / (u | 0) | 0;
							if ((_(k, u) | 0) != (j | 0)) {
								p = -4;
								return p | 0
							}
							j = u + -1 | 0;
							i = k & 65535;
							h = 0;
							while (1) {
								if ((h | 0) >= (j | 0)) {
									i = l;
									h = u;
									break a
								}
								b[e + 200 + (y + h << 1) >> 1] = i;
								h = h + 1 | 0
							}
						}
						f = u + -1 | 0;o = j;p = j;g = 0;
						while (1) {
							if ((g | 0) >= (f | 0)) {
								t = 41;
								break
							}
							w = e + 200 + (y + g << 1) | 0;
							if ((o | 0) < 1) {
								t = 33;
								break
							}
							j = l;
							m = a[j >> 0] | 0;
							if ((m & 255) < 252) {
								m = m & 255;
								b[w >> 1] = m;
								n = 1
							} else {
								if ((o | 0) < 2) {
									t = 37;
									break
								}
								m = (d[j + 1 >> 0] << 2) + (m & 255) & 65535;
								b[w >> 1] = m;
								n = 2
							}
							j = o - n | 0;
							m = m << 16 >> 16;
							if ((m | 0) > (j | 0)) {
								v = -4;
								t = 52;
								break
							}
							o = j;
							l = l + n | 0;
							p = p - (n + m) | 0;
							g = g + 1 | 0
						}
						if ((t | 0) == 33) {
							b[w >> 1] = -1;
							p = -4;
							return p | 0
						} else if ((t | 0) == 37) {
							b[w >> 1] = -1;
							p = -4;
							return p | 0
						} else if ((t | 0) == 41) {
							if ((p | 0) < 0) v = -4;
							else {
								i = l;
								h = u;
								k = p;
								break a
							}
							return v | 0
						} else if ((t | 0) == 52) return v | 0
					}
			}
			while (0);
			if ((k | 0) > 1275) {
				p = -4;
				return p | 0
			}
		b[e + 200 + (y + (h + -1) << 1) >> 1] = k;
		j = 0;
		while (1) {
			if ((j | 0) >= (h | 0)) break;
			c[e + 8 + (y + j << 2) >> 2] = i;
			i = i + (b[e + 200 + (y + j << 1) >> 1] | 0) | 0;
			j = j + 1 | 0
		}
		if ((h | 0) < 1) {
			p = h;
			return p | 0
		}
		c[z >> 2] = (c[z >> 2] | 0) + x;
		p = 0;
		return p | 0
	}

	function Nc(e, f, g, h, i) {
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		i = i | 0;
		var j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0,
			o = 0,
			p = 0;
		if ((f | 0) <= 0) {
			h = -1;
			return h | 0
		}
		if ((c[e + 4 >> 2] | 0) < (f | 0)) {
			h = -1;
			return h | 0
		}
		o = e + 200 | 0;
		a: do switch (f | 0) {
				case 1:
					{
						l = b[o >> 1] | 0;
						if ((l | 0) < (h | 0)) {
							a[g >> 0] = d[e >> 0] & 252;
							k = g + 1 | 0;
							j = l + 1 | 0;
							n = 15;
							break a
						} else {
							h = -2;
							return h | 0
						}
					}
				case 2:
					{
						l = b[e + 202 >> 1] | 0;k = b[o >> 1] | 0;
						if (l << 16 >> 16 == k << 16 >> 16) {
							j = l << 16 >> 16 << 1 | 1;
							if ((j | 0) > (h | 0)) {
								h = -2;
								return h | 0
							} else {
								a[g >> 0] = d[e >> 0] & 252 | 1;
								k = g + 1 | 0;
								n = 15;
								break a
							}
						}
						j = (k << 16 >> 16) + (l << 16 >> 16) + 2 + (k << 16 >> 16 > 251 & 1) | 0;
						if ((j | 0) > (h | 0)) {
							h = -2;
							return h | 0
						}
						m = g + 1 | 0;a[g >> 0] = d[e >> 0] & 252 | 2;l = b[o >> 1] | 0;k = l << 16 >> 16;
						if (l << 16 >> 16 < 252) {
							a[m >> 0] = l;
							l = 2
						} else {
							l = k | 252;
							a[m >> 0] = l;
							a[g + 2 >> 0] = (k - (l & 255) | 0) >>> 2;
							l = 3
						}
						k = g + l | 0;n = 15;
						break
					}
				default:
					{
						l = 1;n = 16
					}
			}
			while (0);
			if ((n | 0) == 15)
				if ((i | 0) != 0 & (j | 0) < (h | 0)) {
					l = 1;
					n = 16
				}
		b: do
			if ((n | 0) == 16) {
				while (1) {
					if ((l | 0) >= (f | 0)) {
						n = 24;
						break
					}
					if ((b[e + 200 + (l << 1) >> 1] | 0) != (b[o >> 1] | 0)) {
						n = 19;
						break
					}
					l = l + 1 | 0;
					n = 16
				}
				do
					if ((n | 0) == 19) {
						l = f + -1 | 0;
						k = 0;
						j = 2;
						while (1) {
							if ((k | 0) >= (l | 0)) break;
							o = b[e + 200 + (k << 1) >> 1] | 0;
							k = k + 1 | 0;
							j = j + ((o << 16 >> 16 > 251 ? 2 : 1) + (o << 16 >> 16)) | 0
						}
						j = j + (b[e + 200 + (l << 1) >> 1] | 0) | 0;
						if ((j | 0) > (h | 0)) {
							h = -2;
							return h | 0
						} else {
							a[g >> 0] = d[e >> 0] | 3;
							a[g + 1 >> 0] = f | 128;
							o = 1;
							break
						}
					} else if ((n | 0) == 24) {
					j = (_(b[o >> 1] | 0, f) | 0) + 2 | 0;
					if ((j | 0) > (h | 0)) {
						h = -2;
						return h | 0
					} else {
						a[g >> 0] = d[e >> 0] | 3;
						a[g + 1 >> 0] = f;
						o = 0;
						break
					}
				} while (0);
				k = g + 2 | 0;
				if ((i | 0) != 0 ? (p = h - j | 0, (j | 0) != (h | 0)) : 0) {
					j = g + 1 | 0;
					a[j >> 0] = d[j >> 0] | 64;
					j = (p + -1 | 0) / 255 | 0;
					l = 0;
					while (1) {
						if ((l | 0) >= (j | 0)) break;
						n = k;
						a[n >> 0] = -1;
						k = n + 1 | 0;
						l = l + 1 | 0
					}
					a[k >> 0] = p + (_(j, -255) | 0) + 255;
					k = k + 1 | 0;
					j = h
				}
				if (o) {
					o = f + -1 | 0;
					n = 0;
					while (1) {
						if ((n | 0) >= (o | 0)) break b;
						l = b[e + 200 + (n << 1) >> 1] | 0;
						m = l << 16 >> 16;
						if (l << 16 >> 16 < 252) {
							a[k >> 0] = l;
							l = 1
						} else {
							l = m | 252;
							a[k >> 0] = l;
							a[k + 1 >> 0] = (m - (l & 255) | 0) >>> 2;
							l = 2
						}
						k = k + l | 0;
						n = n + 1 | 0
					}
				}
			}
		while (0);
		l = 0;
		while (1) {
			if ((l | 0) >= (f | 0)) break;
			o = k;
			p = e + 200 + (l << 1) | 0;
			od(o | 0, c[e + 8 + (l << 2) >> 2] | 0, b[p >> 1] | 0) | 0;
			k = o + (b[p >> 1] | 0) | 0;
			l = l + 1 | 0
		}
		if (!i) {
			h = j;
			return h | 0
		}
		l = g + h | 0;
		while (1) {
			if (k >>> 0 >= l >>> 0) break;
			a[k >> 0] = 0;
			k = k + 1 | 0
		}
		return j | 0
	}

	function Eb(e, f, g, h, j) {
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
			u = 0;
		u = i;
		i = i + 48 | 0;
		q = u;
		m = u + 32 | 0;
		p = (h | 0) == 0;
		s = p ? e + 4768 | 0 : e + 6132 + (g * 36 | 0) | 0;
		r = s + 29 | 0;
		h = (a[r >> 0] << 1) + (a[s + 30 >> 0] | 0) | 0;
		if (p ^ 1 | (h | 0) > 1) hb(f, h + -2 | 0, 34995, 8);
		else hb(f, h, 34999, 8);
		o = (j | 0) == 2;
		h = a[s >> 0] | 0;
		if (o) hb(f, h, 32758, 8);
		else {
			hb(f, h >> 3, 32734 + (a[r >> 0] << 3) | 0, 8);
			hb(f, d[s >> 0] & 7, 35024, 8)
		}
		p = e + 4604 | 0;
		h = 1;
		while (1) {
			if ((h | 0) >= (c[p >> 2] | 0)) break;
			hb(f, a[s + h >> 0] | 0, 32758, 8);
			h = h + 1 | 0
		}
		h = s + 8 | 0;
		n = e + 4724 | 0;
		k = c[n >> 2] | 0;
		l = _(a[r >> 0] >> 1, b[k >> 1] | 0) | 0;
		hb(f, a[h >> 0] | 0, (c[k + 12 >> 2] | 0) + l | 0, 8);
		Nb(q, m, c[n >> 2] | 0, a[h >> 0] | 0);
		h = 0;
		while (1) {
			g = c[n >> 2] | 0;
			if ((h | 0) >= (b[g + 2 >> 1] | 0)) break;
			k = h + 1 | 0;
			l = s + 8 + k | 0;
			m = a[l >> 0] | 0;
			if (m << 24 >> 24 > 3) {
				hb(f, 8, (c[g + 24 >> 2] | 0) + (b[q + (h << 1) >> 1] | 0) | 0, 8);
				hb(f, (a[l >> 0] | 0) + -4 | 0, 35032, 8);
				h = k;
				continue
			}
			h = b[q + (h << 1) >> 1] | 0;
			if (m << 24 >> 24 < -3) {
				hb(f, 0, (c[g + 24 >> 2] | 0) + (h << 16 >> 16) | 0, 8);
				hb(f, -4 - (a[l >> 0] | 0) | 0, 35032, 8);
				h = k;
				continue
			} else {
				hb(f, (m << 24 >> 24) + 4 | 0, (c[g + 24 >> 2] | 0) + (h << 16 >> 16) | 0, 8);
				h = k;
				continue
			}
		}
		if ((c[p >> 2] | 0) == 4) hb(f, a[s + 31 >> 0] | 0, 35001, 8);
		if ((a[r >> 0] | 0) != 2) {
			q = a[r >> 0] | 0;
			q = q << 24 >> 24;
			r = e + 5800 | 0;
			c[r >> 2] = q;
			r = s + 34 | 0;
			r = a[r >> 0] | 0;
			r = r << 24 >> 24;
			hb(f, r, 35009, 8);
			i = u;
			return
		}
		do
			if (o ? (c[e + 5800 >> 2] | 0) == 2 : 0) {
				g = (b[s + 26 >> 1] | 0) - (b[e + 5804 >> 1] | 0) | 0;
				if ((g | 0) < -8 | (g | 0) > 11) {
					hb(f, 0, 35081, 8);
					t = 25;
					break
				} else {
					hb(f, g + 9 | 0, 35081, 8);
					g = s + 26 | 0;
					break
				}
			} else t = 25;
		while (0);
		if ((t | 0) == 25) {
			g = s + 26 | 0;
			n = b[g >> 1] | 0;
			q = c[e + 4600 >> 2] | 0;
			o = (n | 0) / (q >> 1 | 0) | 0;
			q = n - (_(o << 16 >> 16, q << 15 >> 16) | 0) | 0;
			hb(f, o, 35049, 8);
			hb(f, q, c[e + 4716 >> 2] | 0, 8)
		}
		b[e + 5804 >> 1] = b[g >> 1] | 0;
		hb(f, a[s + 28 >> 0] | 0, c[e + 4720 >> 2] | 0, 8);
		g = s + 32 | 0;
		hb(f, a[g >> 0] | 0, 32799, 8);
		h = 0;
		while (1) {
			if ((h | 0) >= (c[p >> 2] | 0)) break;
			hb(f, a[s + 4 + h >> 0] | 0, c[23064 + (a[g >> 0] << 2) >> 2] | 0, 8);
			h = h + 1 | 0
		}
		if (j) {
			q = a[r >> 0] | 0;
			q = q << 24 >> 24;
			r = e + 5800 | 0;
			c[r >> 2] = q;
			r = s + 34 | 0;
			r = a[r >> 0] | 0;
			r = r << 24 >> 24;
			hb(f, r, 35009, 8);
			i = u;
			return
		}
		hb(f, a[s + 33 >> 0] | 0, 34992, 8);
		q = a[r >> 0] | 0;
		q = q << 24 >> 24;
		r = e + 5800 | 0;
		c[r >> 2] = q;
		r = s + 34 | 0;
		r = a[r >> 0] | 0;
		r = r << 24 >> 24;
		hb(f, r, 35009, 8);
		i = u;
		return
	}

	function Fb(b, e, f, g, h) {
		b = b | 0;
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
			C = 0,
			D = 0,
			E = 0,
			F = 0,
			G = 0,
			H = 0,
			I = 0;
		I = i;
		i = i + 96 | 0;
		H = I + 64 | 0;
		C = I + 48 | 0;
		D = I + 40 | 0;
		E = I + 32 | 0;
		k = I;
		c[k >> 2] = 0;
		c[k + 4 >> 2] = 0;
		c[k + 8 >> 2] = 0;
		c[k + 12 >> 2] = 0;
		c[k + 16 >> 2] = 0;
		c[k + 20 >> 2] = 0;
		c[k + 24 >> 2] = 0;
		c[k + 28 >> 2] = 0;
		l = h >> 4;
		if ((l << 4 | 0) < (h | 0)) {
			l = l + 1 | 0;
			n = g + h | 0;
			m = n + 16 | 0;
			do {
				a[n >> 0] = 0;
				n = n + 1 | 0
			} while ((n | 0) < (m | 0))
		}
		n = l << 4;
		B = i;
		i = i + ((1 * (n << 2) | 0) + 15 & -16) | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (n | 0)) break;
			y = a[g + m >> 0] | 0;
			A = y << 24 >> 24;
			c[B + (m << 2) >> 2] = y << 24 >> 24 > 0 ? A : 0 - A | 0;
			A = m | 1;
			y = a[g + A >> 0] | 0;
			z = y << 24 >> 24;
			c[B + (A << 2) >> 2] = y << 24 >> 24 > 0 ? z : 0 - z | 0;
			A = m | 2;
			z = a[g + A >> 0] | 0;
			y = z << 24 >> 24;
			c[B + (A << 2) >> 2] = z << 24 >> 24 > 0 ? y : 0 - y | 0;
			A = m | 3;
			y = a[g + A >> 0] | 0;
			z = y << 24 >> 24;
			c[B + (A << 2) >> 2] = y << 24 >> 24 > 0 ? z : 0 - z | 0;
			m = m + 4 | 0
		}
		G = i;
		i = i + ((1 * (l << 2) | 0) + 15 & -16) | 0;
		F = i;
		i = i + ((1 * (l << 2) | 0) + 15 & -16) | 0;
		n = B;
		m = 0;
		while (1) {
			if ((m | 0) >= (l | 0)) break;
			r = F + (m << 2) | 0;
			c[r >> 2] = 0;
			p = 0;
			a: while (1) {
				if ((p | 0) < 8) {
					q = p << 1;
					q = (c[n + (q << 2) >> 2] | 0) + (c[n + ((q | 1) << 2) >> 2] | 0) | 0;
					if ((q | 0) > 8) o = 1;
					else {
						c[k + (p << 2) >> 2] = q;
						p = p + 1 | 0;
						continue
					}
				} else o = 0;
				p = 0;
				while (1) {
					if ((p | 0) >= 4) {
						q = 0;
						break
					}
					q = p << 1;
					q = (c[k + (q << 2) >> 2] | 0) + (c[k + ((q | 1) << 2) >> 2] | 0) | 0;
					if ((q | 0) > 10) {
						q = 1;
						break
					}
					c[k + (p << 2) >> 2] = q;
					p = p + 1 | 0
				}
				o = o + q | 0;
				p = 0;
				while (1) {
					if ((p | 0) >= 2) {
						q = 0;
						break
					}
					q = p << 1;
					q = (c[k + (q << 2) >> 2] | 0) + (c[k + ((q | 1) << 2) >> 2] | 0) | 0;
					if ((q | 0) > 12) {
						q = 1;
						break
					}
					c[k + (p << 2) >> 2] = q;
					p = p + 1 | 0
				}
				o = o + q | 0;
				p = 0;
				while (1) {
					if ((p | 0) >= 1) {
						q = 0;
						break
					}
					q = p << 1;
					q = (c[k + (q << 2) >> 2] | 0) + (c[k + ((q | 1) << 2) >> 2] | 0) | 0;
					if ((q | 0) > 16) {
						q = 1;
						break
					}
					c[G + (m + p << 2) >> 2] = q;
					p = p + 1 | 0
				}
				if ((o | 0) == (0 - q | 0)) break;
				c[r >> 2] = (c[r >> 2] | 0) + 1;
				q = 0;
				while (1) {
					if ((q | 0) == 16) {
						p = 0;
						continue a
					}
					A = n + (q << 2) | 0;
					c[A >> 2] = c[A >> 2] >> 1;
					q = q + 1 | 0
				}
			}
			n = n + 64 | 0;
			m = m + 1 | 0
		}
		p = e >> 1;
		n = 0;
		m = 2147483647;
		k = 0;
		while (1) {
			if ((k | 0) == 9) break;
			o = 35342 + (k * 18 | 0) + 17 | 0;
			j = 0;
			r = d[35522 + (p * 9 | 0) + k >> 0] | 0;
			while (1) {
				if ((j | 0) >= (l | 0)) break;
				if ((c[F + (j << 2) >> 2] | 0) > 0) q = a[o >> 0] | 0;
				else q = a[(c[G + (j << 2) >> 2] | 0) + (35342 + (k * 18 | 0)) >> 0] | 0;
				j = j + 1 | 0;
				r = r + (q & 255) | 0
			}
			A = (r | 0) < (m | 0);
			n = A ? k : n;
			m = A ? r : m;
			k = k + 1 | 0
		}
		hb(b, n, 35504 + (p * 9 | 0) | 0, 8);
		o = 35162 + (n * 18 | 0) | 0;
		m = 0;
		while (1) {
			if ((m | 0) >= (l | 0)) break;
			n = c[F + (m << 2) >> 2] | 0;
			if (!n) hb(b, c[G + (m << 2) >> 2] | 0, o, 8);
			else {
				hb(b, 17, o, 8);
				q = n + -1 | 0;
				p = 0;
				while (1) {
					if ((p | 0) >= (q | 0)) break;
					hb(b, 17, 35324, 8);
					p = p + 1 | 0
				}
				hb(b, c[G + (m << 2) >> 2] | 0, 35324, 8)
			}
			m = m + 1 | 0
		}
		n = H + 4 | 0;
		m = H + 8 | 0;
		k = C + 4 | 0;
		j = H + 12 | 0;
		s = C + 8 | 0;
		t = D + 4 | 0;
		u = H + 16 | 0;
		v = H + 20 | 0;
		w = H + 24 | 0;
		x = C + 12 | 0;
		y = H + 28 | 0;
		A = 0;
		while (1) {
			if ((A | 0) >= (l | 0)) {
				j = 0;
				break
			}
			if ((c[G + (A << 2) >> 2] | 0) > 0) {
				z = A << 4;
				o = B + (z << 2) | 0;
				r = 0;
				while (1) {
					if ((r | 0) == 8) {
						r = 0;
						break
					}
					p = r << 1;
					c[H + (r << 2) >> 2] = (c[B + (z + p << 2) >> 2] | 0) + (c[B + (z + (p | 1) << 2) >> 2] | 0);
					r = r + 1 | 0
				}
				while (1) {
					if ((r | 0) == 4) {
						r = 0;
						break
					}
					p = r << 1;
					c[C + (r << 2) >> 2] = (c[H + (p << 2) >> 2] | 0) + (c[H + ((p | 1) << 2) >> 2] | 0);
					r = r + 1 | 0
				}
				while (1) {
					if ((r | 0) == 2) {
						r = 0;
						break
					}
					p = r << 1;
					c[D + (r << 2) >> 2] = (c[C + (p << 2) >> 2] | 0) + (c[C + ((p | 1) << 2) >> 2] | 0);
					r = r + 1 | 0
				}
				while (1) {
					if ((r | 0) == 1) break;
					p = r << 1;
					c[E >> 2] = (c[D + (p << 2) >> 2] | 0) + (c[D + ((p | 1) << 2) >> 2] | 0);
					r = r + 1 | 0
				}
				q = c[D >> 2] | 0;
				r = c[E >> 2] | 0;
				if ((r | 0) > 0) hb(b, q, 35996 + (d[36148 + r >> 0] | 0) | 0, 8);
				p = c[C >> 2] | 0;
				if ((q | 0) > 0) hb(b, p, 35844 + (d[36148 + q >> 0] | 0) | 0, 8);
				r = c[H >> 2] | 0;
				if ((p | 0) > 0) hb(b, r, 35692 + (d[36148 + p >> 0] | 0) | 0, 8);
				if ((r | 0) > 0) hb(b, c[o >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[n >> 2] | 0;
				if ((r | 0) > 0) hb(b, c[B + ((z | 2) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[m >> 2] | 0;
				q = c[k >> 2] | 0;
				if ((q | 0) > 0) hb(b, r, 35692 + (d[36148 + q >> 0] | 0) | 0, 8);
				if ((r | 0) > 0) hb(b, c[B + ((z | 4) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[j >> 2] | 0;
				if ((r | 0) > 0) hb(b, c[B + ((z | 6) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				q = c[s >> 2] | 0;
				r = c[t >> 2] | 0;
				if ((r | 0) > 0) hb(b, q, 35844 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[u >> 2] | 0;
				if ((q | 0) > 0) hb(b, r, 35692 + (d[36148 + q >> 0] | 0) | 0, 8);
				if ((r | 0) > 0) hb(b, c[B + ((z | 8) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[v >> 2] | 0;
				if ((r | 0) > 0) hb(b, c[B + ((z | 10) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[w >> 2] | 0;
				q = c[x >> 2] | 0;
				if ((q | 0) > 0) hb(b, r, 35692 + (d[36148 + q >> 0] | 0) | 0, 8);
				if ((r | 0) > 0) hb(b, c[B + ((z | 12) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8);
				r = c[y >> 2] | 0;
				if ((r | 0) > 0) hb(b, c[B + ((z | 14) << 2) >> 2] | 0, 35540 + (d[36148 + r >> 0] | 0) | 0, 8)
			}
			A = A + 1 | 0
		}
		while (1) {
			if ((j | 0) >= (l | 0)) break;
			n = c[F + (j << 2) >> 2] | 0;
			b: do
				if ((n | 0) > 0) {
					m = j << 4;
					o = 0;
					while (1) {
						if ((o | 0) == 16) break b;
						q = a[g + (m + o) >> 0] | 0;
						k = q << 24 >> 24;
						k = (q << 24 >> 24 > 0 ? k : 0 - k | 0) << 24 >> 24;
						q = n;
						while (1) {
							p = q + -1 | 0;
							if ((q | 0) <= 1) break;
							hb(b, k >>> p & 1, 36504, 8);
							q = p
						}
						hb(b, k & 1, 36504, 8);
						o = o + 1 | 0
					}
				}
			while (0);
			j = j + 1 | 0
		}
		a[H + 1 >> 0] = 0;
		n = ((e << 1) + f << 16 >> 16) * 7 | 0;
		m = h + 8 >> 4;
		l = 0;
		while (1) {
			if ((l | 0) >= (m | 0)) break;
			j = c[G + (l << 2) >> 2] | 0;
			c: do
				if ((j | 0) > 0) {
					a[H >> 0] = a[36165 + (n + ((j & 30) >>> 0 < 6 ? j & 31 : 6)) >> 0] | 0;
					k = 0;
					while (1) {
						if ((k | 0) == 16) break c;
						j = a[g + k >> 0] | 0;
						if (j << 24 >> 24) hb(b, (j << 24 >> 24 >> 15) + 1 | 0, H, 8);
						k = k + 1 | 0
					}
				}
			while (0);
			g = g + 16 | 0;
			l = l + 1 | 0
		}
		i = I;
		return
	}

	function Gb(b, e, f, g, h) {
		b = b | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		var i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0,
			n = 0;
		l = (g | 0) == 0;
		n = 0;
		while (1) {
			if ((n | 0) >= (h | 0)) break;
			m = e + (n << 2) | 0;
			g = ((((Wb(c[m >> 2] | 0) | 0) << 16) + -136970240 >> 16) * 2251 | 0) >>> 16 & 255;
			k = b + n | 0;
			a[k >> 0] = g;
			if (g << 24 >> 24 < (a[f >> 0] | 0)) {
				g = g + 1 << 24 >> 24;
				a[k >> 0] = g
			}
			if (g << 24 >> 24 > 63) g = 63;
			else g = g << 24 >> 24 < 0 ? 0 : g << 24 >> 24;
			a[k >> 0] = g;
			i = a[f >> 0] | 0;
			if ((n | 0) == 0 ^ 1 | l ^ 1) {
				i = g - (i & 255) | 0;
				j = i & 255;
				a[k >> 0] = j;
				g = (a[f >> 0] | 0) + 8 | 0;
				i = i << 24 >> 24;
				if ((i | 0) > (g | 0)) {
					j = g + ((i - g + 1 | 0) >>> 1) & 255;
					a[k >> 0] = j
				}
				if (j << 24 >> 24 > 36) j = 36;
				else j = j << 24 >> 24 < -4 ? -4 : j << 24 >> 24;
				a[k >> 0] = j;
				if ((j | 0) > (g | 0)) g = (d[f >> 0] | 0) + ((j << 1) - g) | 0;
				else g = (d[f >> 0] | 0) + j | 0;
				a[f >> 0] = g;
				a[k >> 0] = (d[k >> 0] | 0) + 4;
				g = a[f >> 0] | 0
			} else {
				g = (i << 24 >> 24) + -4 | 0;
				i = a[b >> 0] | 0;
				if ((g | 0) > 63) {
					j = i << 24 >> 24;
					if ((j | 0) <= (g | 0)) g = i << 24 >> 24 < 63 ? 63 : j
				} else if (i << 24 >> 24 > 63) g = 63;
				else {
					k = i << 24 >> 24;
					g = (k | 0) < (g | 0) ? g : k
				}
				g = g & 255;
				a[b >> 0] = g;
				a[f >> 0] = g
			}
			k = g << 24 >> 24;
			k = (k * 29 | 0) + (k * 7281 >> 16) + 2090 | 0;
			c[m >> 2] = Xb((k | 0) < 3967 ? k : 3967) | 0;
			n = n + 1 | 0
		}
		return
	}

	function Hb(d, e, f, g, h, j, k, l, m, n, o, p, q, r, s) {
		d = d | 0;
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
		var t = 0,
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
			Ha = 0,
			Ia = 0,
			Ja = 0,
			Ka = 0,
			La = 0,
			Ma = 0,
			Na = 0,
			Oa = 0,
			Pa = 0,
			Qa = 0,
			Ra = 0,
			Sa = 0,
			Ta = 0,
			Ua = 0,
			Va = 0,
			Wa = 0,
			Xa = 0,
			Ya = 0,
			Za = 0,
			_a = 0;
		Za = i;
		Va = e + 4368 | 0;
		c[Va >> 2] = a[f + 34 >> 0];
		Wa = e + 4356 | 0;
		ra = c[Wa >> 2] | 0;
		Xa = f + 29 | 0;
		Ua = b[30744 + (a[Xa >> 0] >> 1 << 2) + (a[f + 30 >> 0] << 1) >> 1] | 0;
		Qa = (a[f + 31 >> 0] | 0) == 4 ? 0 : 1;
		Fa = d + 4616 | 0;
		Ka = c[Fa >> 2] | 0;
		Ga = d + 4608 | 0;
		Ja = c[Ga >> 2] | 0;
		Ha = i;
		i = i + ((1 * (Ka + Ja << 2) | 0) + 15 & -16) | 0;
		Ia = i;
		i = i + ((1 * (Ka + Ja << 1) | 0) + 15 & -16) | 0;
		Ja = d + 4612 | 0;
		Ka = i;
		i = i + ((1 * (c[Ja >> 2] << 2) | 0) + 15 & -16) | 0;
		La = e + 4364 | 0;
		c[La >> 2] = c[Fa >> 2];
		Ma = e + 4360 | 0;
		c[Ma >> 2] = c[Fa >> 2];
		Na = d + 4604 | 0;
		Oa = Qa ^ 1;
		Pa = e + 4376 | 0;
		Qa = Qa << 1 ^ 3;
		Ra = d + 4664 | 0;
		Sa = d + 5124 | 0;
		Ta = e + 4372 | 0;
		Ba = d + 4660 | 0;
		Ca = e + 3964 | 0;
		Da = e + 4288 | 0;
		Ea = e + 4352 | 0;
		ua = r << 16 >> 16;
		va = Ua + 944 | 0;
		wa = _(Ua, ua) | 0;
		xa = _(va << 16 >> 16, ua) | 0;
		ya = Ua + -944 | 0;
		za = _(944 - Ua << 16 >> 16, ua) | 0;
		Aa = e + 3840 | 0;
		ta = s << 16 >> 16;
		d = ra;
		ra = e + (c[Fa >> 2] << 1) | 0;
		sa = 0;
		while (1) {
			s = c[Na >> 2] | 0;
			if ((sa | 0) >= (s | 0)) break;
			J = (sa >> 1 | Oa) << 4;
			na = j + (J << 1) | 0;
			I = sa * 5 | 0;
			oa = k + (I << 1) | 0;
			pa = sa << 4;
			qa = l + (pa << 1) | 0;
			F = c[m + (sa << 2) >> 2] | 0;
			G = F >> 2;
			F = G | F << 15;
			c[Pa >> 2] = 0;
			s = a[Xa >> 0] | 0;
			r = q + (sa << 2) | 0;
			if (s << 24 >> 24 == 2) {
				d = c[r >> 2] | 0;
				if (!(sa & Qa)) {
					la = c[Fa >> 2] | 0;
					s = c[Ra >> 2] | 0;
					ma = la - d - s + -2 | 0;
					ka = e + (ma + (_(sa, c[Ja >> 2] | 0) | 0) << 1) | 0;
					Yb(Ia + (ma << 1) | 0, ka, na, la - ma | 0, s, c[Sa >> 2] | 0);
					c[Pa >> 2] = 1;
					c[Ma >> 2] = c[Fa >> 2];
					s = a[Xa >> 0] | 0;
					ma = d
				} else {
					s = 2;
					ma = d
				}
			} else ma = d;
			y = c[r >> 2] | 0;
			z = p + (sa << 2) | 0;
			x = c[z >> 2] | 0;
			d = (x | 0) > 1;
			r = aa((d ? x : 1) | 0) | 0;
			d = (d ? x : 1) << r + -1;
			ja = d >> 16;
			t = 536870911 / (ja | 0) | 0;
			ka = t << 16;
			la = ka >> 16;
			d = 536870912 - ((_(ja, la) | 0) + ((_(d & 65535, la) | 0) >> 16)) << 3;
			t = ka + ((_(d >> 16, la) | 0) + ((_(d & 65528, la) | 0) >> 16)) + (_(d, (t >> 15) + 1 >> 1) | 0) | 0;
			r = 62 - r | 0;
			d = r + -47 | 0;
			if ((d | 0) < 1) {
				f = 47 - r | 0;
				d = -2147483648 >> f;
				r = 2147483647 >>> f;
				if ((d | 0) > (r | 0))
					if ((t | 0) > (d | 0)) r = d;
					else r = (t | 0) < (r | 0) ? r : t;
				else if ((t | 0) <= (r | 0)) r = (t | 0) < (d | 0) ? d : t;
				r = r << f
			} else r = (d | 0) < 32 ? t >> d : 0;
			f = c[Ta >> 2] | 0;
			do
				if ((x | 0) == (f | 0)) w = 65536;
				else {
					if ((f | 0) <= 0) {
						d = 0 - f | 0;
						if (!d) u = 32;
						else Ya = 17
					} else {
						d = f;
						Ya = 17
					}
					if ((Ya | 0) == 17) {
						Ya = 0;
						u = aa(d | 0) | 0
					}
					t = f << u + -1;
					if ((x | 0) <= 0) {
						d = 0 - x | 0;
						if (!d) d = 32;
						else Ya = 20
					} else {
						d = x;
						Ya = 20
					}
					if ((Ya | 0) == 20) {
						Ya = 0;
						d = aa(d | 0) | 0
					}
					d = d + -1 | 0;
					f = x << d;
					v = (536870911 / (f >> 16 | 0) | 0) << 16 >> 16;
					la = (_(t >> 16, v) | 0) + ((_(t & 65535, v) | 0) >> 16) | 0;
					f = ud(f | 0, ((f | 0) < 0) << 31 >> 31 | 0, la | 0, ((la | 0) < 0) << 31 >> 31 | 0) | 0;
					f = md(f | 0, C | 0, 29) | 0;
					f = t - (f & -8) | 0;
					v = la + ((_(f >> 16, v) | 0) + ((_(f & 65535, v) | 0) >> 16)) | 0;
					d = u + 28 - d | 0;
					f = d + -16 | 0;
					if ((d | 0) >= 16) {
						w = (f | 0) < 32 ? v >> f : 0;
						break
					}
					t = 16 - d | 0;
					f = -2147483648 >> t;
					d = 2147483647 >>> t;
					if ((f | 0) > (d | 0))
						if ((v | 0) > (f | 0)) d = f;
						else d = (v | 0) < (d | 0) ? d : v;
					else if ((v | 0) <= (d | 0)) d = (v | 0) < (f | 0) ? f : v;
					w = d << t
				}
			while (0);
			f = (r >> 7) + 1 | 0;
			d = f >>> 1 << 16 >> 16;
			f = (f >> 16) + 1 >> 1;
			t = 0;
			while (1) {
				if ((t | 0) >= (c[Ja >> 2] | 0)) break;
				la = c[g + (t << 2) >> 2] | 0;
				c[Ka + (t << 2) >> 2] = (_(la >> 16, d) | 0) + ((_(la & 65535, d) | 0) >> 16) + (_(la, f) | 0);
				t = t + 1 | 0
			}
			c[Ta >> 2] = x;
			a: do
				if (c[Pa >> 2] | 0) {
					if (!sa) r = (_(r >> 16, ta) | 0) + ((_(r & 65535, ta) | 0) >> 16) << 2;
					f = c[Ma >> 2] | 0;
					t = r >> 16;
					r = r & 65535;
					d = f;
					f = f - y + -2 | 0;
					while (1) {
						if ((f | 0) >= (d | 0)) break a;
						d = b[Ia + (f << 1) >> 1] | 0;
						c[Ha + (f << 2) >> 2] = (_(t, d) | 0) + ((_(r, d) | 0) >> 16);
						d = c[Ma >> 2] | 0;
						f = f + 1 | 0
					}
				}
			while (0);
			b: do
				if ((w | 0) != 65536) {
					d = c[La >> 2] | 0;
					v = w >> 16;
					u = w & 65535;
					r = d;
					d = d - (c[Fa >> 2] | 0) | 0;
					while (1) {
						if ((d | 0) >= (r | 0)) break;
						r = e + 1280 + (d << 2) | 0;
						la = c[r >> 2] | 0;
						ka = la << 16 >> 16;
						c[r >> 2] = (_(v, ka) | 0) + ((_(u, ka) | 0) >> 16) + (_(w, (la >> 15) + 1 >> 1) | 0);
						r = c[La >> 2] | 0;
						d = d + 1 | 0
					}
					c: do
						if (s << 24 >> 24 == 2 ? (c[Pa >> 2] | 0) == 0 : 0) {
							s = c[Ma >> 2] | 0;
							r = s;
							s = s - y + -2 | 0;
							while (1) {
								if ((s | 0) >= (r | 0)) break c;
								r = Ha + (s << 2) | 0;
								la = c[r >> 2] | 0;
								ka = la << 16 >> 16;
								c[r >> 2] = (_(v, ka) | 0) + ((_(u, ka) | 0) >> 16) + (_(w, (la >> 15) + 1 >> 1) | 0);
								r = c[Ma >> 2] | 0;
								s = s + 1 | 0
							}
						}
					while (0);
					s = c[Ea >> 2] | 0;
					la = s << 16 >> 16;
					c[Ea >> 2] = (_(v, la) | 0) + ((_(u, la) | 0) >> 16) + (_(w, (s >> 15) + 1 >> 1) | 0);
					s = 0;
					while (1) {
						if ((s | 0) == 32) {
							s = 0;
							break
						}
						la = e + 3840 + (s << 2) | 0;
						ka = c[la >> 2] | 0;
						ja = ka << 16 >> 16;
						c[la >> 2] = (_(v, ja) | 0) + ((_(u, ja) | 0) >> 16) + (_(w, (ka >> 15) + 1 >> 1) | 0);
						s = s + 1 | 0
					}
					while (1) {
						if ((s | 0) == 16) break b;
						la = e + 4288 + (s << 2) | 0;
						ka = c[la >> 2] | 0;
						ja = ka << 16 >> 16;
						c[la >> 2] = (_(v, ja) | 0) + ((_(u, ja) | 0) >> 16) + (_(w, (ka >> 15) + 1 >> 1) | 0);
						s = s + 1 | 0
					}
				}
			while (0);
			N = c[o + (sa << 2) >> 2] | 0;
			D = c[z >> 2] | 0;
			la = c[Ja >> 2] | 0;
			U = c[Ba >> 2] | 0;
			fa = c[Ra >> 2] | 0;
			V = fa >> 1;
			W = j + ((J | 1) << 1) | 0;
			X = j + ((J | 2) << 1) | 0;
			Y = j + ((J | 3) << 1) | 0;
			Z = j + ((J | 4) << 1) | 0;
			$ = j + ((J | 5) << 1) | 0;
			ba = j + ((J | 6) << 1) | 0;
			ca = j + ((J | 7) << 1) | 0;
			da = j + ((J | 8) << 1) | 0;
			ea = j + ((J | 9) << 1) | 0;
			fa = (fa | 0) == 16;
			ga = j + ((J | 10) << 1) | 0;
			ha = j + ((J | 11) << 1) | 0;
			ia = j + ((J | 12) << 1) | 0;
			ja = j + ((J | 13) << 1) | 0;
			ka = j + ((J | 14) << 1) | 0;
			P = j + ((J | 15) << 1) | 0;
			Q = (a[Xa >> 0] | 0) == 2;
			R = k + (I + 1 << 1) | 0;
			S = k + (I + 2 << 1) | 0;
			T = k + (I + 3 << 1) | 0;
			H = k + (I + 4 << 1) | 0;
			I = U >> 1;
			K = U + -1 | 0;
			J = e + 4288 + (K << 2) | 0;
			K = l + (pa + K << 1) | 0;
			L = c[n + (sa << 2) >> 2] << 16 >> 16;
			M = N << 16 >> 16;
			N = N >> 16;
			O = (ma | 0) > 0;
			G = G << 16 >> 16;
			A = F >> 16;
			B = D >>> 6 << 16 >> 16;
			D = (D >> 21) + 1 >> 1;
			f = Ha + ((c[Ma >> 2] | 0) - ma + 2 << 2) | 0;
			E = Ca;
			z = e + 1280 + ((c[La >> 2] | 0) - ma + 1 << 2) | 0;
			F = 0;
			while (1) {
				if ((F | 0) >= (la | 0)) break;
				c[Va >> 2] = (_(c[Va >> 2] | 0, 196314165) | 0) + 907633515;
				y = c[E >> 2] | 0;
				d = b[na >> 1] | 0;
				d = V + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
				y = c[E + -4 >> 2] | 0;
				x = b[W >> 1] | 0;
				x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
				y = c[E + -8 >> 2] | 0;
				d = b[X >> 1] | 0;
				d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
				y = c[E + -12 >> 2] | 0;
				x = b[Y >> 1] | 0;
				x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
				y = c[E + -16 >> 2] | 0;
				d = b[Z >> 1] | 0;
				d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
				y = c[E + -20 >> 2] | 0;
				x = b[$ >> 1] | 0;
				x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
				y = c[E + -24 >> 2] | 0;
				d = b[ba >> 1] | 0;
				d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
				y = c[E + -28 >> 2] | 0;
				x = b[ca >> 1] | 0;
				x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
				y = c[E + -32 >> 2] | 0;
				d = b[da >> 1] | 0;
				d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
				y = c[E + -36 >> 2] | 0;
				x = b[ea >> 1] | 0;
				x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
				if (fa) {
					y = c[E + -40 >> 2] | 0;
					d = b[ga >> 1] | 0;
					d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
					y = c[E + -44 >> 2] | 0;
					x = b[ha >> 1] | 0;
					x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
					y = c[E + -48 >> 2] | 0;
					d = b[ia >> 1] | 0;
					d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
					y = c[E + -52 >> 2] | 0;
					x = b[ja >> 1] | 0;
					x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0;
					y = c[E + -56 >> 2] | 0;
					d = b[ka >> 1] | 0;
					d = x + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
					y = c[E + -60 >> 2] | 0;
					x = b[P >> 1] | 0;
					x = d + ((_(y >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16)) | 0
				}
				if (Q) {
					y = c[f >> 2] | 0;
					w = b[oa >> 1] | 0;
					w = (_(y >> 16, w) | 0) + ((_(y & 65535, w) | 0) >> 16) + 2 | 0;
					y = c[f + -4 >> 2] | 0;
					d = b[R >> 1] | 0;
					d = w + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
					y = c[f + -8 >> 2] | 0;
					w = b[S >> 1] | 0;
					w = d + ((_(y >> 16, w) | 0) + ((_(y & 65535, w) | 0) >> 16)) | 0;
					y = c[f + -12 >> 2] | 0;
					d = b[T >> 1] | 0;
					d = w + ((_(y >> 16, d) | 0) + ((_(y & 65535, d) | 0) >> 16)) | 0;
					y = c[f + -16 >> 2] | 0;
					w = b[H >> 1] | 0;
					w = d + ((_(y >> 16, w) | 0) + ((_(y & 65535, w) | 0) >> 16)) | 0;
					f = f + 4 | 0
				} else w = 0;
				r = c[E >> 2] | 0;
				s = c[Da >> 2] | 0;
				c[Da >> 2] = r;
				d = b[qa >> 1] | 0;
				d = I + ((_(r >> 16, d) | 0) + ((_(r & 65535, d) | 0) >> 16)) | 0;
				r = 2;
				while (1) {
					if ((r | 0) >= (U | 0)) break;
					v = r + -1 | 0;
					t = e + 4288 + (v << 2) | 0;
					u = c[t >> 2] | 0;
					c[t >> 2] = s;
					v = b[l + (pa + v << 1) >> 1] | 0;
					v = d + ((_(s >> 16, v) | 0) + ((_(s & 65535, v) | 0) >> 16)) | 0;
					t = e + 4288 + (r << 2) | 0;
					y = c[t >> 2] | 0;
					c[t >> 2] = u;
					t = b[l + (pa + r << 1) >> 1] | 0;
					d = v + ((_(u >> 16, t) | 0) + ((_(u & 65535, t) | 0) >> 16)) | 0;
					r = r + 2 | 0;
					s = y
				}
				c[J >> 2] = s;
				t = b[K >> 1] | 0;
				t = d + ((_(s >> 16, t) | 0) + ((_(s & 65535, t) | 0) >> 16)) << 1;
				u = c[Ea >> 2] | 0;
				d = u >> 16;
				u = u & 65535;
				t = t + ((_(d, L) | 0) + ((_(u, L) | 0) >> 16)) | 0;
				y = c[e + 1280 + ((c[La >> 2] | 0) + -1 << 2) >> 2] | 0;
				u = (_(y >> 16, M) | 0) + ((_(y & 65535, M) | 0) >> 16) + (_(d, N) | 0) + ((_(u, N) | 0) >> 16) | 0;
				d = (x << 2) - t - u | 0;
				if (O) {
					r = (c[z >> 2] | 0) + (c[z + -8 >> 2] | 0) | 0;
					r = (_(r >> 16, G) | 0) + ((_(r & 65535, G) | 0) >> 16) | 0;
					y = c[z + -4 >> 2] | 0;
					v = z + 4 | 0;
					d = w - (r + (_(y >> 16, A) | 0) + ((_(y & 65535, A) | 0) >> 16) << 1) + (d << 1) >> 2
				} else {
					v = z;
					d = d >> 1
				}
				d = (c[Ka + (F << 2) >> 2] | 0) - (d + 1 >> 1) | 0;
				y = (c[Va >> 2] | 0) < 0;
				z = 0 - d | 0;
				s = y ? z : d;
				s = ((y ? z : d) | 0) > 30720 ? 30720 : (s | 0) < -31744 ? -31744 : s;
				d = s - Ua >> 10;
				if ((d | 0) <= 0)
					if (d)
						if ((d | 0) == -1) {
							z = ya;
							y = Ua;
							d = za;
							r = wa
						} else {
							r = (d << 10 | 80) + Ua | 0;
							z = r;
							y = r + 1024 | 0;
							d = _(0 - r << 16 >> 16, ua) | 0;
							r = _(-1024 - r << 16 >> 16, ua) | 0
						}
				else {
					z = Ua;
					y = va;
					d = wa;
					r = xa
				} else {
					d = (d << 10) + -80 + Ua | 0;
					r = d + 1024 | 0;
					z = d;
					y = r;
					d = _(d << 16 >> 16, ua) | 0;
					r = _(r << 16 >> 16, ua) | 0
				}
				_a = s - z << 16 >> 16;
				s = s - y << 16 >> 16;
				d = (r + (_(s, s) | 0) | 0) < (d + (_(_a, _a) | 0) | 0);
				d = d ? y : z;
				y = h + F | 0;
				a[y >> 0] = ((d >>> 9) + 1 | 0) >>> 1;
				d = d << 4;
				d = ((c[Va >> 2] | 0) < 0 ? 0 - d | 0 : d) + (w << 1) | 0;
				x = d + (x << 4) | 0;
				z = ((_(x >> 16, B) | 0) + ((_(x & 65535, B) | 0) >> 16) + (_(x, D) | 0) >> 7) + 1 >> 1;
				b[ra + (F << 1) >> 1] = (z | 0) > 32767 ? 32767 : (z | 0) < -32768 ? -32768 : z;
				z = E + 4 | 0;
				c[z >> 2] = x;
				x = x - (t << 2) | 0;
				c[Ea >> 2] = x;
				c[e + 1280 + (c[La >> 2] << 2) >> 2] = x - (u << 2);
				c[Ha + (c[Ma >> 2] << 2) >> 2] = d << 1;
				c[La >> 2] = (c[La >> 2] | 0) + 1;
				c[Ma >> 2] = (c[Ma >> 2] | 0) + 1;
				c[Va >> 2] = (c[Va >> 2] | 0) + (a[y >> 0] | 0);
				E = z;
				z = v;
				F = F + 1 | 0
			}
			d = Aa;
			s = e + 3840 + (la << 2) | 0;
			r = d + 128 | 0;
			do {
				c[d >> 2] = c[s >> 2];
				d = d + 4 | 0;
				s = s + 4 | 0
			} while ((d | 0) < (r | 0));
			qa = c[Ja >> 2] | 0;
			h = h + qa | 0;
			g = g + (qa << 2) | 0;
			d = ma;
			ra = ra + (qa << 1) | 0;
			sa = sa + 1 | 0
		}
		c[Wa >> 2] = c[q + (s + -1 << 2) >> 2];
		od(e | 0, e + (c[Ga >> 2] << 1) | 0, c[Fa >> 2] << 1 | 0) | 0;
		od(e + 1280 | 0, e + 1280 + (c[Ga >> 2] << 2) | 0, c[Fa >> 2] << 2 | 0) | 0;
		i = Za;
		return
	}

	function Ib(e, f, g, h, j, k, l, m, n, o, p, q, r, s, t) {
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
			ta = 0;
		sa = i;
		i = i + 144 | 0;
		la = sa + 128 | 0;
		ga = sa;
		ma = f + 4356 | 0;
		z = c[ma >> 2] | 0;
		ea = e + 4652 | 0;
		y = c[ea >> 2] | 0;
		oa = i;
		i = i + ((1 * (y * 1168 | 0) | 0) + 15 & -16) | 0;
		id(oa | 0, 0, y * 1168 | 0) | 0;
		ka = g + 34 | 0;
		pa = f + 4352 | 0;
		qa = e + 4616 | 0;
		ra = f + 3840 | 0;
		na = f + 4288 | 0;
		x = 0;
		while (1) {
			if ((x | 0) >= (y | 0)) break;
			u = x + (d[ka >> 0] | 0) & 3;
			c[oa + (x * 1168 | 0) + 1156 >> 2] = u;
			c[oa + (x * 1168 | 0) + 1160 >> 2] = u;
			c[oa + (x * 1168 | 0) + 1164 >> 2] = 0;
			c[oa + (x * 1168 | 0) + 1152 >> 2] = c[pa >> 2];
			c[oa + (x * 1168 | 0) + 960 >> 2] = c[f + 1280 + ((c[qa >> 2] | 0) + -1 << 2) >> 2];
			u = oa + (x * 1168 | 0) | 0;
			w = ra;
			v = u + 128 | 0;
			do {
				c[u >> 2] = c[w >> 2];
				u = u + 4 | 0;
				w = w + 4 | 0
			} while ((u | 0) < (v | 0));
			u = oa + (x * 1168 | 0) + 1088 | 0;
			w = na;
			v = u + 64 | 0;
			do {
				c[u >> 2] = c[w >> 2];
				u = u + 4 | 0;
				w = w + 4 | 0
			} while ((u | 0) < (v | 0));
			x = x + 1 | 0
		}
		$ = g + 29 | 0;
		fa = a[$ >> 0] | 0;
		ba = b[30744 + (fa << 24 >> 24 >> 1 << 2) + (a[g + 30 >> 0] << 1) >> 1] | 0;
		c[la >> 2] = 0;
		ja = e + 4612 | 0;
		v = c[ja >> 2] | 0;
		y = (v | 0) > 32 ? 32 : v;
		a: do
			if (fa << 24 >> 24 != 2)
				if ((z | 0) > 0) {
					da = z + -3 | 0;
					da = (y | 0) < (da | 0) ? y : da
				} else da = y;
		else {
			w = c[e + 4604 >> 2] | 0;
			x = 0;
			while (1) {
				if ((x | 0) >= (w | 0)) {
					da = y;
					break a
				}
				fa = (c[r + (x << 2) >> 2] | 0) + -3 | 0;
				y = (y | 0) < (fa | 0) ? y : fa;
				x = x + 1 | 0
			}
		}
		while (0);
		P = (a[g + 31 >> 0] | 0) == 4 ? 0 : 1;
		Z = c[qa >> 2] | 0;
		ia = e + 4608 | 0;
		X = Z + (c[ia >> 2] | 0) | 0;
		V = i;
		i = i + ((1 * (X << 2) | 0) + 15 & -16) | 0;
		W = i;
		i = i + ((1 * (X << 1) | 0) + 15 & -16) | 0;
		X = i;
		i = i + ((1 * (v << 2) | 0) + 15 & -16) | 0;
		ca = f + 4364 | 0;
		c[ca >> 2] = Z;
		M = f + 4360 | 0;
		c[M >> 2] = c[qa >> 2];
		fa = e + 4604 | 0;
		N = P ^ 1;
		O = f + 4376 | 0;
		P = P << 1 ^ 3;
		Y = oa + 1164 | 0;
		Q = q + 4 | 0;
		R = e + 4664 | 0;
		S = e + 5124 | 0;
		T = f + 4372 | 0;
		U = e + 4660 | 0;
		L = e + 4704 | 0;
		K = t << 16 >> 16;
		t = z;
		Z = f + (Z << 1) | 0;
		J = 0;
		e = 0;
		while (1) {
			if ((J | 0) >= (c[fa >> 2] | 0)) break;
			F = k + ((J >> 1 | N) << 4 << 1) | 0;
			G = l + (J * 5 << 1) | 0;
			H = m + (J << 4 << 1) | 0;
			I = c[n + (J << 2) >> 2] | 0;
			I = I >> 2 | I >>> 1 << 16;
			c[O >> 2] = 0;
			g = a[$ >> 0] | 0;
			z = r + (J << 2) | 0;
			if (g << 24 >> 24 == 2) {
				t = c[z >> 2] | 0;
				if (!(J & P)) {
					b: do
						if ((J | 0) == 2) {
							y = c[ea >> 2] | 0;
							g = c[Y >> 2] | 0;
							x = 0;
							e = 1;
							while (1) {
								if ((e | 0) >= (y | 0)) {
									g = 0;
									break
								}
								v = c[oa + (e * 1168 | 0) + 1164 >> 2] | 0;
								w = (v | 0) < (g | 0);
								g = w ? v : g;
								x = w ? e : x;
								e = e + 1 | 0
							}
							while (1) {
								if ((g | 0) >= (y | 0)) break;
								if ((g | 0) != (x | 0)) {
									e = oa + (g * 1168 | 0) + 1164 | 0;
									c[e >> 2] = (c[e >> 2] | 0) + 134217727
								}
								g = g + 1 | 0
							}
							g = (c[la >> 2] | 0) + da | 0;
							y = 0;
							while (1) {
								if ((y | 0) >= (da | 0)) {
									e = 0;
									break b
								}
								e = g + 31 & 31;
								w = y - da | 0;
								a[j + w >> 0] = (((c[oa + (x * 1168 | 0) + 576 + (e << 2) >> 2] | 0) >>> 9) + 1 | 0) >>> 1;
								u = c[oa + (x * 1168 | 0) + 704 + (e << 2) >> 2] | 0;
								v = c[Q >> 2] | 0;
								A = v << 16 >> 16;
								v = ((_(u >> 16, A) | 0) + ((_(u & 65535, A) | 0) >> 16) + (_(u, (v >> 15) + 1 >> 1) | 0) >> 13) + 1 >> 1;
								b[Z + (w << 1) >> 1] = (v | 0) > 32767 ? 32767 : (v | 0) < -32768 ? -32768 : v;
								c[f + 1280 + ((c[ca >> 2] | 0) - da + y << 2) >> 2] = c[oa + (x * 1168 | 0) + 960 + (e << 2) >> 2];
								g = e;
								y = y + 1 | 0
							}
						}while (0);x = c[qa >> 2] | 0;y = c[R >> 2] | 0;g = x - t - y + -2 | 0;w = f + (g + (_(J, c[ja >> 2] | 0) | 0) << 1) | 0;Yb(W + (g << 1) | 0, w, F, x - g | 0, y, c[S >> 2] | 0);c[M >> 2] = c[qa >> 2];c[O >> 2] = 1;y = z;g = a[$ >> 0] | 0
				}
				else {
					y = z;
					g = 2
				}
			} else y = z;
			E = c[ea >> 2] | 0;
			B = c[y >> 2] | 0;
			D = q + (J << 2) | 0;
			A = c[D >> 2] | 0;
			u = (A | 0) > 1;
			z = aa((u ? A : 1) | 0) | 0;
			u = (u ? A : 1) << z + -1;
			w = u >> 16;
			v = 536870911 / (w | 0) | 0;
			x = v << 16;
			y = x >> 16;
			u = 536870912 - ((_(w, y) | 0) + ((_(u & 65535, y) | 0) >> 16)) << 3;
			v = x + ((_(u >> 16, y) | 0) + ((_(u & 65528, y) | 0) >> 16)) + (_(u, (v >> 15) + 1 >> 1) | 0) | 0;
			z = 62 - z | 0;
			u = z + -47 | 0;
			if ((u | 0) < 1) {
				u = 47 - z | 0;
				z = -2147483648 >> u;
				y = 2147483647 >>> u;
				if ((z | 0) > (y | 0))
					if ((v | 0) > (z | 0)) y = z;
					else y = (v | 0) < (y | 0) ? y : v;
				else if ((v | 0) <= (y | 0)) y = (v | 0) < (z | 0) ? z : v;
				y = y << u
			} else y = (u | 0) < 32 ? v >> u : 0;
			u = c[T >> 2] | 0;
			do
				if ((A | 0) == (u | 0)) x = 65536;
				else {
					if ((u | 0) <= 0) {
						z = 0 - u | 0;
						if (!z) v = 32;
						else ha = 37
					} else {
						z = u;
						ha = 37
					}
					if ((ha | 0) == 37) {
						ha = 0;
						v = aa(z | 0) | 0
					}
					u = u << v + -1;
					if ((A | 0) <= 0) {
						z = 0 - A | 0;
						if (!z) z = 32;
						else ha = 40
					} else {
						z = A;
						ha = 40
					}
					if ((ha | 0) == 40) {
						ha = 0;
						z = aa(z | 0) | 0
					}
					z = z + -1 | 0;
					ta = A << z;
					w = (536870911 / (ta >> 16 | 0) | 0) << 16 >> 16;
					x = (_(u >> 16, w) | 0) + ((_(u & 65535, w) | 0) >> 16) | 0;
					ta = ud(ta | 0, ((ta | 0) < 0) << 31 >> 31 | 0, x | 0, ((x | 0) < 0) << 31 >> 31 | 0) | 0;
					ta = md(ta | 0, C | 0, 29) | 0;
					u = u - (ta & -8) | 0;
					w = x + ((_(u >> 16, w) | 0) + ((_(u & 65535, w) | 0) >> 16)) | 0;
					z = v + 28 - z | 0;
					u = z + -16 | 0;
					if ((z | 0) >= 16) {
						x = (u | 0) < 32 ? w >> u : 0;
						break
					}
					v = 16 - z | 0;
					u = -2147483648 >> v;
					z = 2147483647 >>> v;
					if ((u | 0) > (z | 0))
						if ((w | 0) > (u | 0)) z = u;
						else z = (w | 0) < (z | 0) ? z : w;
					else if ((w | 0) <= (z | 0)) z = (w | 0) < (u | 0) ? u : w;
					x = z << v
				}
			while (0);
			v = (y >> 7) + 1 | 0;
			u = v >>> 1 << 16 >> 16;
			v = (v >> 16) + 1 >> 1;
			z = c[ja >> 2] | 0;
			w = 0;
			while (1) {
				if ((w | 0) >= (z | 0)) break;
				ta = c[h + (w << 2) >> 2] | 0;
				c[X + (w << 2) >> 2] = (_(ta >> 16, u) | 0) + ((_(ta & 65535, u) | 0) >> 16) + (_(ta, v) | 0);
				w = w + 1 | 0
			}
			c[T >> 2] = A;
			c: do
				if (c[O >> 2] | 0) {
					if (!J) y = (_(y >> 16, K) | 0) + ((_(y & 65535, K) | 0) >> 16) << 2;
					v = c[M >> 2] | 0;
					w = y >> 16;
					z = y & 65535;
					u = v;
					v = v - B + -2 | 0;
					while (1) {
						if ((v | 0) >= (u | 0)) break c;
						u = b[W + (v << 1) >> 1] | 0;
						c[V + (v << 2) >> 2] = (_(w, u) | 0) + ((_(z, u) | 0) >> 16);
						u = c[M >> 2] | 0;
						v = v + 1 | 0
					}
				}
			while (0);
			d: do
				if ((x | 0) != 65536) {
					u = c[ca >> 2] | 0;
					v = x >> 16;
					w = x & 65535;
					z = u;
					u = u - (c[qa >> 2] | 0) | 0;
					while (1) {
						if ((u | 0) >= (z | 0)) break;
						z = f + 1280 + (u << 2) | 0;
						y = c[z >> 2] | 0;
						A = y << 16 >> 16;
						c[z >> 2] = (_(v, A) | 0) + ((_(w, A) | 0) >> 16) + (_(x, (y >> 15) + 1 >> 1) | 0);
						z = c[ca >> 2] | 0;
						u = u + 1 | 0
					}
					e: do
						if (g << 24 >> 24 == 2 ? (c[O >> 2] | 0) == 0 : 0) {
							g = c[M >> 2] | 0;
							z = g;
							g = g - B + -2 | 0;
							while (1) {
								if ((g | 0) >= (z - da | 0)) {
									z = 0;
									break e
								}
								z = V + (g << 2) | 0;
								y = c[z >> 2] | 0;
								u = y << 16 >> 16;
								c[z >> 2] = (_(v, u) | 0) + ((_(w, u) | 0) >> 16) + (_(x, (y >> 15) + 1 >> 1) | 0);
								z = c[M >> 2] | 0;
								g = g + 1 | 0
							}
						} else z = 0;
					while (0);
					while (1) {
						if ((z | 0) >= (E | 0)) break d;
						g = c[oa + (z * 1168 | 0) + 1152 >> 2] | 0;
						y = g << 16 >> 16;
						c[oa + (z * 1168 | 0) + 1152 >> 2] = (_(v, y) | 0) + ((_(w, y) | 0) >> 16) + (_(x, (g >> 15) + 1 >> 1) | 0);
						g = 0;
						while (1) {
							if ((g | 0) == 32) {
								g = 0;
								break
							}
							y = oa + (z * 1168 | 0) + (g << 2) | 0;
							u = c[y >> 2] | 0;
							A = u << 16 >> 16;
							c[y >> 2] = (_(v, A) | 0) + ((_(w, A) | 0) >> 16) + (_(x, (u >> 15) + 1 >> 1) | 0);
							g = g + 1 | 0
						}
						while (1) {
							if ((g | 0) == 16) {
								g = 0;
								break
							}
							y = oa + (z * 1168 | 0) + 1088 + (g << 2) | 0;
							u = c[y >> 2] | 0;
							A = u << 16 >> 16;
							c[y >> 2] = (_(v, A) | 0) + ((_(w, A) | 0) >> 16) + (_(x, (u >> 15) + 1 >> 1) | 0);
							g = g + 1 | 0
						}
						while (1) {
							if ((g | 0) == 32) break;
							y = oa + (z * 1168 | 0) + 832 + (g << 2) | 0;
							u = c[y >> 2] | 0;
							A = u << 16 >> 16;
							c[y >> 2] = (_(v, A) | 0) + ((_(w, A) | 0) >> 16) + (_(x, (u >> 15) + 1 >> 1) | 0);
							y = oa + (z * 1168 | 0) + 960 + (g << 2) | 0;
							u = c[y >> 2] | 0;
							A = u << 16 >> 16;
							c[y >> 2] = (_(v, A) | 0) + ((_(w, A) | 0) >> 16) + (_(x, (u >> 15) + 1 >> 1) | 0);
							g = g + 1 | 0
						}
						z = z + 1 | 0
					}
				}
			while (0);
			Jb(f, oa, a[$ >> 0] | 0, X, j, Z, V, ga, F, G, H, t, I, c[o + (J << 2) >> 2] | 0, c[p + (J << 2) >> 2] | 0, c[D >> 2] | 0, s, ba, c[ja >> 2] | 0, e, c[U >> 2] | 0, c[R >> 2] | 0, c[L >> 2] | 0, c[ea >> 2] | 0, la, da);
			g = c[ja >> 2] | 0;
			j = j + g | 0;
			h = h + (g << 2) | 0;
			Z = Z + (g << 1) | 0;
			J = J + 1 | 0;
			e = e + 1 | 0
		}
		v = c[ea >> 2] | 0;
		x = c[Y >> 2] | 0;
		y = 0;
		w = 1;
		while (1) {
			if ((w | 0) >= (v | 0)) break;
			p = c[oa + (w * 1168 | 0) + 1164 >> 2] | 0;
			l = (p | 0) < (x | 0);
			x = l ? p : x;
			y = l ? w : y;
			w = w + 1 | 0
		}
		a[ka >> 0] = c[oa + (y * 1168 | 0) + 1160 >> 2];
		x = c[q + ((c[fa >> 2] | 0) + -1 << 2) >> 2] | 0;
		w = x >>> 6 << 16 >> 16;
		x = (x >> 21) + 1 >> 1;
		u = (c[la >> 2] | 0) + da | 0;
		v = 0;
		while (1) {
			if ((v | 0) >= (da | 0)) break;
			l = u + 31 & 31;
			p = v - da | 0;
			a[j + p >> 0] = (((c[oa + (y * 1168 | 0) + 576 + (l << 2) >> 2] | 0) >>> 9) + 1 | 0) >>> 1;
			n = c[oa + (y * 1168 | 0) + 704 + (l << 2) >> 2] | 0;
			n = ((_(n >> 16, w) | 0) + ((_(n & 65535, w) | 0) >> 16) + (_(n, x) | 0) >> 7) + 1 >> 1;
			b[Z + (p << 1) >> 1] = (n | 0) > 32767 ? 32767 : (n | 0) < -32768 ? -32768 : n;
			c[f + 1280 + ((c[ca >> 2] | 0) - da + v << 2) >> 2] = c[oa + (y * 1168 | 0) + 960 + (l << 2) >> 2];
			u = l;
			v = v + 1 | 0
		}
		u = ra;
		w = oa + (y * 1168 | 0) + (c[ja >> 2] << 2) | 0;
		v = u + 128 | 0;
		do {
			c[u >> 2] = c[w >> 2];
			u = u + 4 | 0;
			w = w + 4 | 0
		} while ((u | 0) < (v | 0));
		u = na;
		w = oa + (y * 1168 | 0) + 1088 | 0;
		v = u + 64 | 0;
		do {
			c[u >> 2] = c[w >> 2];
			u = u + 4 | 0;
			w = w + 4 | 0
		} while ((u | 0) < (v | 0));
		c[pa >> 2] = c[oa + (y * 1168 | 0) + 1152 >> 2];
		c[ma >> 2] = c[r + ((c[fa >> 2] | 0) + -1 << 2) >> 2];
		od(f | 0, f + (c[ia >> 2] << 1) | 0, c[qa >> 2] << 1 | 0) | 0;
		od(f + 1280 | 0, f + 1280 + (c[ia >> 2] << 2) | 0, c[qa >> 2] << 2 | 0) | 0;
		i = sa;
		return
	}

	function Jb(d, e, f, g, h, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B, C, D) {
		d = d | 0;
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
		u = u | 0;
		v = v | 0;
		w = w | 0;
		x = x | 0;
		y = y | 0;
		z = z | 0;
		A = A | 0;
		B = B | 0;
		C = C | 0;
		D = D | 0;
		var E = 0,
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
			aa = 0,
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
			Ga = 0;
		Da = i;
		Aa = i;
		i = i + ((1 * (B * 48 | 0) | 0) + 15 & -16) | 0;
		Ba = d + 4364 | 0;
		Ca = d + 4360 | 0;
		za = t >> 6;
		sa = (f | 0) == 2;
		ta = n + 2 | 0;
		ua = n + 4 | 0;
		va = n + 6 | 0;
		wa = n + 8 | 0;
		xa = (p | 0) > 0;
		ya = q << 16 >> 16;
		ha = q >> 16;
		ia = z >> 1;
		ja = m + 2 | 0;
		ka = m + 4 | 0;
		la = m + 6 | 0;
		ma = m + 8 | 0;
		na = m + 10 | 0;
		oa = m + 12 | 0;
		pa = m + 14 | 0;
		qa = m + 16 | 0;
		ra = m + 18 | 0;
		aa = (z | 0) == 16;
		ba = m + 20 | 0;
		ca = m + 22 | 0;
		da = m + 24 | 0;
		ea = m + 26 | 0;
		fa = m + 28 | 0;
		ga = m + 30 | 0;
		X = A << 16 >> 16;
		Y = y >> 1;
		Z = y + -1 | 0;
		$ = o + (Z << 1) | 0;
		V = r << 16 >> 16;
		W = s << 16 >> 16;
		U = s >> 16;
		M = u << 16 >> 16;
		N = v + 944 | 0;
		O = _(v << 16 >> 16, M) | 0;
		P = _(N << 16 >> 16, M) | 0;
		Q = v + -944 | 0;
		R = _(944 - v << 16 >> 16, M) | 0;
		S = Aa + 4 | 0;
		T = Aa + 28 | 0;
		L = (x | 0) <= 0;
		u = k + ((c[Ca >> 2] | 0) - p + 2 << 2) | 0;
		s = d + 1280 + ((c[Ba >> 2] | 0) - p + 1 << 2) | 0;
		K = 0;
		while (1) {
			if ((K | 0) >= (w | 0)) {
				z = 0;
				break
			}
			if (sa) {
				I = c[u >> 2] | 0;
				H = b[n >> 1] | 0;
				H = (_(I >> 16, H) | 0) + ((_(I & 65535, H) | 0) >> 16) + 2 | 0;
				I = c[u + -4 >> 2] | 0;
				p = b[ta >> 1] | 0;
				p = H + ((_(I >> 16, p) | 0) + ((_(I & 65535, p) | 0) >> 16)) | 0;
				I = c[u + -8 >> 2] | 0;
				H = b[ua >> 1] | 0;
				H = p + ((_(I >> 16, H) | 0) + ((_(I & 65535, H) | 0) >> 16)) | 0;
				I = c[u + -12 >> 2] | 0;
				p = b[va >> 1] | 0;
				p = H + ((_(I >> 16, p) | 0) + ((_(I & 65535, p) | 0) >> 16)) | 0;
				I = c[u + -16 >> 2] | 0;
				H = b[wa >> 1] | 0;
				H = p + ((_(I >> 16, H) | 0) + ((_(I & 65535, H) | 0) >> 16)) << 1;
				I = u + 4 | 0
			} else {
				H = 0;
				I = u
			}
			if (xa) {
				J = (c[s >> 2] | 0) + (c[s + -8 >> 2] | 0) | 0;
				J = (_(J >> 16, ya) | 0) + ((_(J & 65535, ya) | 0) >> 16) | 0;
				G = c[s + -4 >> 2] | 0;
				G = H - (J + (_(G >> 16, ha) | 0) + ((_(G & 65535, ha) | 0) >> 16) << 2) | 0;
				J = s + 4 | 0
			} else {
				G = 0;
				J = s
			}
			z = K + 31 | 0;
			E = g + (K << 2) | 0;
			F = 0;
			while (1) {
				if ((F | 0) >= (B | 0)) break;
				A = e + (F * 1168 | 0) + 1156 | 0;
				c[A >> 2] = (_(c[e + (F * 1168 | 0) + 1156 >> 2] | 0, 196314165) | 0) + 907633515;
				p = e + (F * 1168 | 0) + (z << 2) | 0;
				u = c[p >> 2] | 0;
				s = b[m >> 1] | 0;
				s = ia + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 30 << 2) >> 2] | 0;
				x = b[ja >> 1] | 0;
				x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 29 << 2) >> 2] | 0;
				s = b[ka >> 1] | 0;
				s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 28 << 2) >> 2] | 0;
				x = b[la >> 1] | 0;
				x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 27 << 2) >> 2] | 0;
				s = b[ma >> 1] | 0;
				s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 26 << 2) >> 2] | 0;
				x = b[na >> 1] | 0;
				x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 25 << 2) >> 2] | 0;
				s = b[oa >> 1] | 0;
				s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 24 << 2) >> 2] | 0;
				x = b[pa >> 1] | 0;
				x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 23 << 2) >> 2] | 0;
				s = b[qa >> 1] | 0;
				s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
				u = c[e + (F * 1168 | 0) + (K + 22 << 2) >> 2] | 0;
				x = b[ra >> 1] | 0;
				x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
				if (aa) {
					u = c[e + (F * 1168 | 0) + (K + 21 << 2) >> 2] | 0;
					s = b[ba >> 1] | 0;
					s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
					u = c[e + (F * 1168 | 0) + (K + 20 << 2) >> 2] | 0;
					x = b[ca >> 1] | 0;
					x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
					u = c[e + (F * 1168 | 0) + (K + 19 << 2) >> 2] | 0;
					s = b[da >> 1] | 0;
					s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
					u = c[e + (F * 1168 | 0) + (K + 18 << 2) >> 2] | 0;
					x = b[ea >> 1] | 0;
					x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0;
					u = c[e + (F * 1168 | 0) + (K + 17 << 2) >> 2] | 0;
					s = b[fa >> 1] | 0;
					s = x + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
					u = c[e + (F * 1168 | 0) + (K + 16 << 2) >> 2] | 0;
					x = b[ga >> 1] | 0;
					x = s + ((_(u >> 16, x) | 0) + ((_(u & 65535, x) | 0) >> 16)) | 0
				}
				s = e + (F * 1168 | 0) + 1088 | 0;
				t = c[s >> 2] | 0;
				u = (c[p >> 2] | 0) + ((_(t >> 16, X) | 0) + ((_(t & 65535, X) | 0) >> 16)) | 0;
				p = c[e + (F * 1168 | 0) + 1092 >> 2] | 0;
				r = p - u | 0;
				r = t + ((_(r >> 16, X) | 0) + ((_(r & 65535, X) | 0) >> 16)) | 0;
				c[s >> 2] = u;
				s = b[o >> 1] | 0;
				s = Y + ((_(u >> 16, s) | 0) + ((_(u & 65535, s) | 0) >> 16)) | 0;
				u = 2;
				while (1) {
					if ((u | 0) >= (y | 0)) break;
					Ea = u + -1 | 0;
					f = e + (F * 1168 | 0) + 1088 + (u << 2) | 0;
					Ga = c[f >> 2] | 0;
					q = Ga - r | 0;
					q = p + ((_(q >> 16, X) | 0) + ((_(q & 65535, X) | 0) >> 16)) | 0;
					c[e + (F * 1168 | 0) + 1088 + (Ea << 2) >> 2] = r;
					Ea = b[o + (Ea << 1) >> 1] | 0;
					Ea = s + ((_(r >> 16, Ea) | 0) + ((_(r & 65535, Ea) | 0) >> 16)) | 0;
					Fa = c[e + (F * 1168 | 0) + 1088 + ((u | 1) << 2) >> 2] | 0;
					t = Fa - q | 0;
					t = Ga + ((_(t >> 16, X) | 0) + ((_(t & 65535, X) | 0) >> 16)) | 0;
					c[f >> 2] = q;
					f = b[o + (u << 1) >> 1] | 0;
					p = Fa;
					s = Ea + ((_(q >> 16, f) | 0) + ((_(q & 65535, f) | 0) >> 16)) | 0;
					u = u + 2 | 0;
					r = t
				}
				q = x << 4;
				c[e + (F * 1168 | 0) + 1088 + (Z << 2) >> 2] = r;
				t = b[$ >> 1] | 0;
				t = s + ((_(r >> 16, t) | 0) + ((_(r & 65535, t) | 0) >> 16)) << 1;
				f = c[e + (F * 1168 | 0) + 1152 >> 2] | 0;
				p = f >> 16;
				f = f & 65535;
				t = t + ((_(p, V) | 0) + ((_(f, V) | 0) >> 16)) << 2;
				r = c[e + (F * 1168 | 0) + 960 + (c[C >> 2] << 2) >> 2] | 0;
				f = (_(r >> 16, W) | 0) + ((_(r & 65535, W) | 0) >> 16) + (_(p, U) | 0) + ((_(f, U) | 0) >> 16) << 2;
				p = (c[E >> 2] | 0) - ((G + q - (t + f) >> 3) + 1 >> 1) | 0;
				r = (c[A >> 2] | 0) < 0;
				x = 0 - p | 0;
				A = r ? x : p;
				A = ((r ? x : p) | 0) > 30720 ? 30720 : (A | 0) < -31744 ? -31744 : A;
				p = A - v >> 10;
				if ((p | 0) <= 0)
					if (p)
						if ((p | 0) == -1) {
							p = Q;
							x = v;
							u = R;
							s = O
						} else {
							s = (p << 10 | 80) + v | 0;
							p = s;
							x = s + 1024 | 0;
							u = _(0 - s << 16 >> 16, M) | 0;
							s = _(-1024 - s << 16 >> 16, M) | 0
						}
				else {
					p = v;
					x = N;
					u = O;
					s = P
				} else {
					u = (p << 10) + -80 + v | 0;
					s = u + 1024 | 0;
					p = u;
					x = s;
					u = _(u << 16 >> 16, M) | 0;
					s = _(s << 16 >> 16, M) | 0
				}
				Ea = A - p << 16 >> 16;
				Ea = u + (_(Ea, Ea) | 0) >> 10;
				A = A - x << 16 >> 16;
				s = s + (_(A, A) | 0) >> 10;
				A = (Ea | 0) < (s | 0);
				Fa = c[e + (F * 1168 | 0) + 1164 >> 2] | 0;
				u = A ? p : x;
				x = A ? x : p;
				c[Aa + (F * 48 | 0) + 4 >> 2] = Fa + (A ? Ea : s);
				c[Aa + (F * 48 | 0) + 28 >> 2] = Fa + (A ? s : Ea);
				c[Aa + (F * 48 | 0) >> 2] = u;
				c[Aa + (F * 48 | 0) + 24 >> 2] = x;
				u = u << 4;
				u = (r ? 0 - u | 0 : u) + H | 0;
				p = u + q | 0;
				s = p - t | 0;
				c[Aa + (F * 48 | 0) + 16 >> 2] = s - f;
				c[Aa + (F * 48 | 0) + 12 >> 2] = s;
				c[Aa + (F * 48 | 0) + 20 >> 2] = u;
				c[Aa + (F * 48 | 0) + 8 >> 2] = p;
				x = x << 4;
				x = (r ? 0 - x | 0 : x) + H | 0;
				p = x + q | 0;
				u = p - t | 0;
				c[Aa + (F * 48 | 0) + 40 >> 2] = u - f;
				c[Aa + (F * 48 | 0) + 36 >> 2] = u;
				c[Aa + (F * 48 | 0) + 44 >> 2] = x;
				c[Aa + (F * 48 | 0) + 32 >> 2] = p;
				F = F + 1 | 0
			}
			u = (c[C >> 2] | 0) + 31 | 0;
			c[C >> 2] = u & 31;
			u = u + D | 0;
			s = c[S >> 2] | 0;
			t = 0;
			r = 1;
			while (1) {
				if ((r | 0) >= (B | 0)) break;
				x = c[Aa + (r * 48 | 0) + 4 >> 2] | 0;
				p = (x | 0) < (s | 0);
				s = p ? x : s;
				t = p ? r : t;
				r = r + 1 | 0
			}
			p = u & 31;
			u = c[e + (t * 1168 | 0) + 448 + (p << 2) >> 2] | 0;
			s = 0;
			while (1) {
				if ((s | 0) >= (B | 0)) break;
				if ((c[e + (s * 1168 | 0) + 448 + (p << 2) >> 2] | 0) != (u | 0)) {
					x = Aa + (s * 48 | 0) + 4 | 0;
					c[x >> 2] = (c[x >> 2] | 0) + 134217727;
					x = Aa + (s * 48 | 0) + 28 | 0;
					c[x >> 2] = (c[x >> 2] | 0) + 134217727
				}
				s = s + 1 | 0
			}
			x = c[S >> 2] | 0;
			u = 0;
			s = c[T >> 2] | 0;
			r = 0;
			A = 1;
			while (1) {
				if ((A | 0) >= (B | 0)) break;
				E = c[Aa + (A * 48 | 0) + 4 >> 2] | 0;
				z = (E | 0) > (x | 0);
				q = c[Aa + (A * 48 | 0) + 28 >> 2] | 0;
				f = (q | 0) < (s | 0);
				x = z ? E : x;
				u = z ? A : u;
				s = f ? q : s;
				r = f ? A : r;
				A = A + 1 | 0
			}
			if ((s | 0) < (x | 0)) {
				nd(e + (u * 1168 | 0) + (K << 2) | 0, e + (r * 1168 | 0) + (K << 2) | 0, 1168 - (K << 2) | 0) | 0;
				x = Aa + (u * 48 | 0) | 0;
				u = Aa + (r * 48 | 0) + 24 | 0;
				c[x >> 2] = c[u >> 2];
				c[x + 4 >> 2] = c[u + 4 >> 2];
				c[x + 8 >> 2] = c[u + 8 >> 2];
				c[x + 12 >> 2] = c[u + 12 >> 2];
				c[x + 16 >> 2] = c[u + 16 >> 2];
				c[x + 20 >> 2] = c[u + 20 >> 2]
			}
			if (!(L & (K | 0) < (D | 0))) {
				x = K - D | 0;
				a[h + x >> 0] = (((c[e + (t * 1168 | 0) + 576 + (p << 2) >> 2] | 0) >>> 9) + 1 | 0) >>> 1;
				s = c[e + (t * 1168 | 0) + 704 + (p << 2) >> 2] | 0;
				u = c[l + (p << 2) >> 2] | 0;
				r = u << 16 >> 16;
				u = ((_(s >> 16, r) | 0) + ((_(s & 65535, r) | 0) >> 16) + (_(s, (u >> 15) + 1 >> 1) | 0) >> 7) + 1 >> 1;
				b[j + (x << 1) >> 1] = (u | 0) > 32767 ? 32767 : (u | 0) < -32768 ? -32768 : u;
				c[d + 1280 + ((c[Ba >> 2] | 0) - D << 2) >> 2] = c[e + (t * 1168 | 0) + 960 + (p << 2) >> 2];
				c[k + ((c[Ca >> 2] | 0) - D << 2) >> 2] = c[e + (t * 1168 | 0) + 832 + (p << 2) >> 2]
			}
			c[Ba >> 2] = (c[Ba >> 2] | 0) + 1;
			c[Ca >> 2] = (c[Ca >> 2] | 0) + 1;
			u = K + 32 | 0;
			s = 0;
			while (1) {
				if ((s | 0) >= (B | 0)) break;
				c[e + (s * 1168 | 0) + 1152 >> 2] = c[Aa + (s * 48 | 0) + 12 >> 2];
				p = c[Aa + (s * 48 | 0) + 8 >> 2] | 0;
				c[e + (s * 1168 | 0) + (u << 2) >> 2] = p;
				c[e + (s * 1168 | 0) + 704 + (c[C >> 2] << 2) >> 2] = p;
				p = c[Aa + (s * 48 | 0) >> 2] | 0;
				c[e + (s * 1168 | 0) + 576 + (c[C >> 2] << 2) >> 2] = p;
				c[e + (s * 1168 | 0) + 832 + (c[C >> 2] << 2) >> 2] = c[Aa + (s * 48 | 0) + 20 >> 2] << 1;
				c[e + (s * 1168 | 0) + 960 + (c[C >> 2] << 2) >> 2] = c[Aa + (s * 48 | 0) + 16 >> 2];
				x = e + (s * 1168 | 0) + 1156 | 0;
				p = (c[x >> 2] | 0) + ((p >> 9) + 1 >> 1) | 0;
				c[x >> 2] = p;
				c[e + (s * 1168 | 0) + 448 + (c[C >> 2] << 2) >> 2] = p;
				c[e + (s * 1168 | 0) + 1164 >> 2] = c[Aa + (s * 48 | 0) + 4 >> 2];
				s = s + 1 | 0
			}
			c[l + (c[C >> 2] << 2) >> 2] = za;
			u = I;
			s = J;
			K = K + 1 | 0
		}
		while (1) {
			if ((z | 0) >= (B | 0)) break;
			q = e + (z * 1168 | 0) | 0;
			f = e + (z * 1168 | 0) + (w << 2) | 0;
			t = q + 128 | 0;
			do {
				c[q >> 2] = c[f >> 2];
				q = q + 4 | 0;
				f = f + 4 | 0
			} while ((q | 0) < (t | 0));
			z = z + 1 | 0
		}
		i = Da;
		return
	}

	function Kb(a, d) {
		a = a | 0;
		d = d | 0;
		var f = 0,
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
			u = 0,
			v = 0;
		u = i;
		i = i + 48 | 0;
		r = u + 32 | 0;
		t = u + 16 | 0;
		q = u;
		s = a + 4608 | 0;
		k = c[s >> 2] | 0;
		m = k >> 1;
		h = k >> 2;
		o = k >> 3;
		c[q >> 2] = 0;
		n = o + h | 0;
		c[q + 4 >> 2] = n;
		l = n + o | 0;
		c[q + 8 >> 2] = l;
		j = l + h | 0;
		c[q + 12 >> 2] = j;
		p = i;
		i = i + ((1 * (j + m << 1) | 0) + 15 & -16) | 0;
		Ub(d, a + 32 | 0, p, p + (j << 1) | 0, k);
		Ub(p, a + 40 | 0, p, p + (l << 1) | 0, m);
		Ub(p, a + 48 | 0, p, p + (n << 1) | 0, h);
		d = p + (o + -1 << 1) | 0;
		h = (b[d >> 1] | 0) >>> 1 & 65535;
		b[d >> 1] = h;
		d = o;
		while (1) {
			g = d + -1 | 0;
			if ((d | 0) <= 1) break;
			o = p + (d + -2 << 1) | 0;
			n = (b[o >> 1] | 0) >>> 1;
			b[o >> 1] = n;
			o = p + (g << 1) | 0;
			b[o >> 1] = (e[o >> 1] | 0) - n;
			d = g
		}
		n = a + 88 | 0;
		b[p >> 1] = (e[p >> 1] | 0) - (e[n >> 1] | 0);
		b[n >> 1] = h;
		n = 0;
		l = 0;
		while (1) {
			if ((n | 0) == 4) break;
			h = 4 - n | 0;
			h = c[s >> 2] >> ((h | 0) < 3 ? h : 3) >> 2;
			g = a + 56 + (n << 2) | 0;
			k = c[g >> 2] | 0;
			d = r + (n << 2) | 0;
			c[d >> 2] = k;
			f = q + (n << 2) | 0;
			m = 0;
			o = 0;
			while (1) {
				if ((o | 0) == 4) break;
				else {
					j = 0;
					l = 0
				}
				while (1) {
					if ((j | 0) >= (h | 0)) break;
					v = b[p + ((c[f >> 2] | 0) + j + m << 1) >> 1] >> 3;
					j = j + 1 | 0;
					l = l + (_(v, v) | 0) | 0
				}
				if ((o | 0) < 3) {
					j = k + l | 0;
					v = (j | 0) < 0;
					k = v ? 2147483647 : j;
					j = v ? 2147483647 : j
				} else {
					j = k + (l >> 1) | 0;
					v = (j | 0) < 0;
					k = v ? 2147483647 : j;
					j = v ? 2147483647 : j
				}
				c[d >> 2] = j;
				m = m + h | 0;
				o = o + 1 | 0
			}
			c[g >> 2] = l;
			n = n + 1 | 0
		}
		l = a + 140 | 0;
		d = c[l >> 2] | 0;
		if ((d | 0) < 1e3) j = 32767 / ((d >> 4) + 1 | 0) | 0;
		else j = 0;
		k = 0;
		while (1) {
			if ((k | 0) == 4) break;
			d = a + 92 + (k << 2) | 0;
			g = c[d >> 2] | 0;
			h = (c[r + (k << 2) >> 2] | 0) + (c[a + 124 + (k << 2) >> 2] | 0) | 0;
			h = (h | 0) < 0 ? 2147483647 : h;
			f = 2147483647 / (h | 0) | 0;
			if ((h | 0) <= (g << 3 | 0))
				if ((h | 0) < (g | 0)) h = 1024;
				else {
					o = g << 16 >> 16;
					n = _(f >> 16, o) | 0;
					o = _(f & 65535, o) | 0;
					h = _(f, (g >> 15) + 1 >> 1) | 0;
					h = n + (o >> 16) + h >> 16 << 11 | (n + (o >>> 16) + h | 0) >>> 5 & 2047
				}
			else h = 128;
			n = a + 108 + (k << 2) | 0;
			g = c[n >> 2] | 0;
			m = f - g | 0;
			o = ((h | 0) > (j | 0) ? h : j) << 16 >> 16;
			o = g + ((_(m >> 16, o) | 0) + ((_(m & 65535, o) | 0) >> 16)) | 0;
			c[n >> 2] = o;
			o = 2147483647 / (o | 0) | 0;
			c[d >> 2] = (o | 0) < 16777215 ? o : 16777215;
			k = k + 1 | 0
		}
		c[l >> 2] = (c[l >> 2] | 0) + 1;
		o = 0;
		k = 0;
		h = 0;
		while (1) {
			if ((k | 0) == 4) break;
			g = c[r + (k << 2) >> 2] | 0;
			d = c[a + 92 + (k << 2) >> 2] | 0;
			l = g - d | 0;
			if ((l | 0) > 0) {
				if (g >>> 0 < 8388608) g = (g << 8 | 0) / (d + 1 | 0) | 0;
				else g = (g | 0) / ((d >> 8) + 1 | 0) | 0;
				c[t + (k << 2) >> 2] = g;
				g = (Wb(g) | 0) + -1024 | 0;
				d = g << 16 >> 16;
				h = h + (_(d, d) | 0) | 0;
				if ((l | 0) < 1048576) {
					g = (Lb(l) | 0) << 6;
					g = (_(g >> 16, d) | 0) + ((_(g & 65472, d) | 0) >> 16) | 0
				}
				n = c[23388 + (k << 2) >> 2] | 0;
				g = g << 16 >> 16;
				g = o + ((_(n >> 16, g) | 0) + ((_(n & 65535, g) | 0) >> 16)) | 0
			} else {
				c[t + (k << 2) >> 2] = 256;
				g = o
			}
			o = g;
			k = k + 1 | 0
		}
		d = ((Lb((h | 0) / 4 | 0) | 0) * 196608 >> 16) * 45e3 >> 16;
		g = d + -128 | 0;
		if ((d | 0) < 128) {
			d = 128 - d | 0;
			if ((g | 0) < -191) f = 0;
			else {
				f = d >> 5;
				f = (c[23404 + (f << 2) >> 2] | 0) - (_(c[23428 + (f << 2) >> 2] << 16 >> 16, d & 31) | 0) | 0
			}
		} else if ((g | 0) > 191) f = 32767;
		else {
			f = g >> 5;
			f = (c[23452 + (f << 2) >> 2] | 0) + (_(c[23428 + (f << 2) >> 2] << 16 >> 16, g & 31) | 0) | 0
		}
		if ((o | 0) < 0) {
			d = 0 - o | 0;
			if ((o | 0) < -191) d = 0;
			else {
				o = d >> 5;
				d = (c[23404 + (o << 2) >> 2] | 0) - (_(c[23428 + (o << 2) >> 2] << 16 >> 16, d & 31) | 0) | 0
			}
		} else if ((o | 0) > 191) d = 32767;
		else {
			d = o >> 5;
			d = (c[23452 + (d << 2) >> 2] | 0) + (_(c[23428 + (d << 2) >> 2] << 16 >> 16, o & 31) | 0) | 0
		}
		c[a + 4744 >> 2] = (d << 1) + -32768;
		d = 0;
		g = 0;
		while (1) {
			if ((g | 0) == 4) break;
			o = g + 1 | 0;
			d = d + (_(o, (c[r + (g << 2) >> 2] | 0) - (c[a + 92 + (g << 2) >> 2] | 0) >> 4) | 0) | 0;
			g = o
		}
		if ((d | 0) >= 1) {
			if ((d | 0) < 32768) {
				if ((c[s >> 2] | 0) == ((c[a + 4600 >> 2] | 0) * 10 | 0)) d = d << 16;
				else d = d << 15;
				o = (Lb(d) | 0) + 32768 | 0;
				f = f << 16 >> 16;
				f = (_(o >> 16, f) | 0) + ((_(o & 65535, f) | 0) >> 16) | 0
			}
		} else f = f >> 1;
		g = f >> 7;
		c[a + 4556 >> 2] = (g | 0) < 255 ? g : 255;
		g = f << 16 >> 16;
		g = ((_(f >> 16, g) | 0) << 16) + (_(f & 65535, g) | 0) | 0;
		g = (c[s >> 2] | 0) == ((c[a + 4600 >> 2] | 0) * 10 | 0) ? g >> 21 : g >> 20;
		h = 0;
		while (1) {
			if ((h | 0) == 4) break;
			f = a + 72 + (h << 2) | 0;
			o = c[f >> 2] | 0;
			d = (c[t + (h << 2) >> 2] | 0) - o | 0;
			d = o + ((_(d >> 16, g) | 0) + ((_(d & 65535, g) | 0) >> 16)) | 0;
			c[f >> 2] = d;
			d = ((Wb(d) | 0) * 3 | 0) + -5120 | 0;
			f = d >> 4;
			if ((f | 0) < 0) {
				d = 0 - f | 0;
				if ((f | 0) < -191) f = 0;
				else {
					f = d >> 5;
					f = (c[23404 + (f << 2) >> 2] | 0) - (_(c[23428 + (f << 2) >> 2] << 16 >> 16, d & 31) | 0) | 0
				}
			} else if ((f | 0) > 191) f = 32767;
			else {
				o = d >> 9;
				f = (c[23452 + (o << 2) >> 2] | 0) + (_(c[23428 + (o << 2) >> 2] << 16 >> 16, f & 31) | 0) | 0
			}
			c[a + 4728 + (h << 2) >> 2] = f;
			h = h + 1 | 0
		}
		i = u;
		return
	}

	function Lb(a) {
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

	function Mb(f, g, h, j, k, l, m) {
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
			ia = 0,
			ja = 0,
			ka = 0,
			la = 0;
		ia = i;
		i = i + 560 | 0;
		da = ia + 232 | 0;
		ca = ia + 472 | 0;
		ha = ia + 440 | 0;
		ga = ia + 200 | 0;
		R = ia + 184 | 0;
		Q = ia + 168 | 0;
		W = ia + 88 | 0;
		X = ia + 8 | 0;
		U = ia;
		$ = ia + 408 | 0;
		Z = ia + 376 | 0;
		P = ia + 344 | 0;
		T = ia + 312 | 0;
		S = ia + 280 | 0;
		Y = ia + 536 | 0;
		V = ia + 248 | 0;
		ea = h + 32 | 0;
		fa = h + 2 | 0;
		$b(g, c[ea >> 2] | 0, b[fa >> 1] | 0);
		n = b[h >> 1] | 0;
		t = i;
		i = i + ((1 * ((n & 65535) << 2) | 0) + 15 & -16) | 0;
		ba = h + 8 | 0;
		n = n << 16 >> 16;
		p = b[fa >> 1] | 0;
		s = c[ba >> 2] | 0;
		o = 0;
		while (1) {
			if ((o | 0) < (n | 0)) {
				r = 0;
				q = 0
			} else break;
			while (1) {
				if ((r | 0) >= (p | 0)) break;
				M = s;
				N = (e[g + (r << 1) >> 1] | 0) - (d[M >> 0] << 7) << 16 >> 16;
				N = _(N, N) | 0;
				O = (e[g + ((r | 1) << 1) >> 1] | 0) - (d[M + 1 >> 0] << 7) << 16 >> 16;
				s = M + 2 | 0;
				r = r + 2 | 0;
				q = q + ((N + (_(O, O) | 0) | 0) >>> 4) | 0
			}
			c[t + (o << 2) >> 2] = q;
			o = o + 1 | 0
		}
		N = i;
		i = i + ((1 * (l << 2) | 0) + 15 & -16) | 0;
		ic(t, N, n, l);
		I = i;
		i = i + ((1 * (l << 2) | 0) + 15 & -16) | 0;
		J = i;
		i = i + ((1 * (l << 4) | 0) + 15 & -16) | 0;
		K = h + 28 | 0;
		O = h + 4 | 0;
		L = h + 6 | 0;
		M = k << 16 >> 16;
		G = m >> 1;
		H = h + 12 | 0;
		E = k << 14 >> 16;
		F = 0;
		while (1) {
			if ((F | 0) >= (l | 0)) break;
			D = c[N + (F << 2) >> 2] | 0;
			t = b[fa >> 1] | 0;
			s = _(D, t) | 0;
			r = c[ba >> 2] | 0;
			q = 0;
			while (1) {
				if ((q | 0) >= (t | 0)) break;
				u = d[r + (s + q) >> 0] << 7;
				b[P + (q << 1) >> 1] = u;
				b[$ + (q << 1) >> 1] = (e[g + (q << 1) >> 1] | 0) - u;
				q = q + 1 | 0
			}
			ac(T, P, t);
			q = b[fa >> 1] | 0;
			k = 0;
			while (1) {
				if ((k | 0) >= (q | 0)) {
					t = 0;
					break
				}
				s = b[T + (k << 1) >> 1] | 0;
				t = (s & 65535) << 16;
				if ((t | 0) < 1) t = 0;
				else {
					if (!(s << 16 >> 16)) r = 32;
					else r = aa(t | 0) | 0;
					m = 24 - r | 0;
					s = 0 - m | 0;
					do
						if (m)
							if ((m | 0) < 0) {
								t = t << s | t >>> (m + 32 | 0);
								break
							} else {
								t = t << 32 - m | t >>> m;
								break
							}
					while (0);
					u = ((r & 1 | 0) == 0 ? 46214 : 32768) >>> (r >>> 1);
					t = (_(t & 127, 13959168) | 0) >>> 16;
					t = u + ((_(u >> 16, t) | 0) + ((_(u & 65535, t) | 0) >>> 16)) | 0
				}
				b[Z + (k << 1) >> 1] = (_(b[$ + (k << 1) >> 1] | 0, t << 16 >> 16) | 0) >>> 14;
				k = k + 1 | 0
			}
			while (1) {
				if ((t | 0) >= (q | 0)) break;
				b[S + (t << 1) >> 1] = (b[j + (t << 1) >> 1] << 5 | 0) / (b[T + (t << 1) >> 1] | 0) | 0;
				t = t + 1 | 0
			}
			Nb(V, Y, h, D);
			C = F << 4;
			q = c[K >> 2] | 0;
			p = b[L >> 1] | 0;
			m = b[fa >> 1] | 0;
			t = b[O >> 1] | 0;
			r = -10;
			while (1) {
				if ((r | 0) == 10) break;
				k = r << 10;
				a: do
					if ((r | 0) > 0) {
						s = k + -102 | 0;
						k = k | 922
					} else switch (r | 0) {
						case 0:
							{
								s = k;k = k | 922;
								break a
							}
						case -1:
							{
								s = k | 102;k = k + 1024 | 0;
								break a
							}
						default:
							{
								s = k | 102;k = k + 1126 | 0;
								break a
							}
					}
					while (0);
				u = r + 10 | 0;
				c[W + (u << 2) >> 2] = (_(s >> 16, t) | 0) + ((_(s & 65535, t) | 0) >> 16);
				c[X + (u << 2) >> 2] = (_(k >> 16, t) | 0) + ((_(k & 65535, t) | 0) >> 16);
				r = r + 1 | 0
			}
			c[ga >> 2] = 0;
			b[ha >> 1] = 0;
			B = m << 16 >> 16;
			A = p << 16 >> 16 >> 16;
			y = p & 65535;
			k = 1;
			w = B;
			b: while (1) {
				z = w + -1 | 0;
				t = b[V + (z << 1) >> 1] | 0;
				s = d[Y + z >> 0] << 8;
				r = b[Z + (z << 1) >> 1] | 0;
				p = S + (z << 1) | 0;
				x = 0;
				while (1) {
					if ((x | 0) >= (k | 0)) break;
					u = ha + (x << 1) | 0;
					n = (_(s, b[u >> 1] | 0) | 0) >> 16;
					m = r - n << 16 >> 16;
					m = (_(A, m) | 0) + ((_(y, m) | 0) >> 16) | 0;
					m = (m | 0) > 9 ? 9 : (m | 0) < -10 ? -10 : m;
					a[ca + (x << 4) + z >> 0] = m;
					v = m + 10 | 0;
					o = (c[W + (v << 2) >> 2] | 0) + n | 0;
					n = (c[X + (v << 2) >> 2] | 0) + n | 0;
					b[u >> 1] = o;
					u = x + k | 0;
					b[ha + (u << 1) >> 1] = n;
					do
						if ((m | 0) > 2)
							if ((m | 0) == 3) {
								v = d[q + (t + 7) >> 0] | 0;
								m = 280;
								break
							} else {
								m = (m << 16 >> 16) * 43 | 0;
								v = m + 108 | 0;
								m = m + 151 | 0;
								break
							}
					else {
						if ((m | 0) >= -3) {
							v = d[q + (t + (m + 4)) >> 0] | 0;
							m = d[q + (t + (m + 5)) >> 0] | 0;
							break
						}
						if ((m | 0) == -4) {
							v = 280;
							m = d[q + (t + 1) >> 0] | 0;
							break
						} else {
							m = _(m << 16 >> 16, -43) | 0;
							v = m + 108 | 0;
							m = m + 65 | 0;
							break
						}
					} while (0);
					ka = ga + (x << 2) | 0;
					ja = c[ka >> 2] | 0;
					la = r - o << 16 >> 16;
					la = _(la, la) | 0;
					o = b[p >> 1] | 0;
					c[ka >> 2] = ja + (_(la, o) | 0) + (_(M, v << 16 >> 16) | 0);
					n = r - n << 16 >> 16;
					c[ga + (u << 2) >> 2] = ja + (_(_(n, n) | 0, o) | 0) + (_(M, m << 16 >> 16) | 0);
					x = x + 1 | 0
				}
				if ((k | 0) < 3) {
					m = 0;
					while (1) {
						if ((m | 0) >= (k | 0)) break;
						a[ca + (m + k << 4) + z >> 0] = (d[ca + (m << 4) + z >> 0] | 0) + 1;
						m = m + 1 | 0
					}
					k = k << 1;
					m = k;
					while (1) {
						if ((m | 0) >= 4) {
							w = z;
							continue b
						}
						a[ca + (m << 4) + z >> 0] = a[ca + (m - k << 4) + z >> 0] | 0;
						m = m + 1 | 0
					}
				}
				if ((w | 0) > 1) o = 0;
				else {
					q = 2147483647;
					s = 0;
					m = 0;
					break
				}
				while (1) {
					if ((o | 0) == 4) {
						m = 0;
						p = 0;
						t = 0;
						s = 2147483647;
						r = 0;
						break
					}
					t = ga + (o << 2) | 0;
					s = c[t >> 2] | 0;
					m = o + 4 | 0;
					r = ga + (m << 2) | 0;
					p = c[r >> 2] | 0;
					if ((s | 0) > (p | 0)) {
						c[Q + (o << 2) >> 2] = s;
						c[R + (o << 2) >> 2] = p;
						c[t >> 2] = p;
						c[r >> 2] = s;
						s = ha + (o << 1) | 0;
						t = b[s >> 1] | 0;
						u = ha + (m << 1) | 0;
						b[s >> 1] = b[u >> 1] | 0;
						b[u >> 1] = t
					} else {
						c[R + (o << 2) >> 2] = s;
						c[Q + (o << 2) >> 2] = p;
						m = o
					}
					c[da + (o << 2) >> 2] = m;
					o = o + 1 | 0
				}
				while (1) {
					if ((r | 0) != 4) {
						u = c[Q + (r << 2) >> 2] | 0;
						o = (s | 0) > (u | 0);
						n = c[R + (r << 2) >> 2] | 0;
						v = (t | 0) < (n | 0);
						m = v ? r : m;
						p = o ? r : p;
						t = v ? n : t;
						s = o ? u : s;
						r = r + 1 | 0;
						continue
					}
					if ((s | 0) >= (t | 0)) {
						m = 0;
						break
					}
					c[da + (m << 2) >> 2] = c[da + (p << 2) >> 2] ^ 4;
					s = p + 4 | 0;
					c[ga + (m << 2) >> 2] = c[ga + (s << 2) >> 2];
					b[ha + (m << 1) >> 1] = b[ha + (s << 1) >> 1] | 0;
					c[R + (m << 2) >> 2] = 0;
					c[Q + (p << 2) >> 2] = 2147483647;
					s = ca + (m << 4) | 0;
					m = ca + (p << 4) | 0;
					t = s + 16 | 0;
					do {
						a[s >> 0] = a[m >> 0] | 0;
						s = s + 1 | 0;
						m = m + 1 | 0
					} while ((s | 0) < (t | 0));
					m = 0;
					p = 0;
					t = 0;
					s = 2147483647;
					r = 0
				}
				while (1) {
					if ((m | 0) == 4) {
						w = z;
						continue b
					}
					u = ca + (m << 4) + z | 0;
					a[u >> 0] = (d[u >> 0] | 0) + ((c[da + (m << 2) >> 2] | 0) >>> 2);
					m = m + 1 | 0
				}
			}
			while (1) {
				if ((m | 0) == 8) break;
				k = c[ga + (m << 2) >> 2] | 0;
				u = (q | 0) > (k | 0);
				q = u ? k : q;
				s = u ? m : s;
				m = m + 1 | 0
			}
			m = J + C | 0;
			t = s & 3;
			k = 0;
			while (1) {
				if ((k | 0) >= (B | 0)) break;
				a[J + (C + k) >> 0] = a[ca + (t << 4) + k >> 0] | 0;
				k = k + 1 | 0
			}
			a[m >> 0] = (d[m >> 0] | 0) + (s >>> 2);
			m = I + (F << 2) | 0;
			c[m >> 2] = q;
			t = _(G, b[h >> 1] | 0) | 0;
			s = c[H >> 2] | 0;
			r = a[s + (t + D) >> 0] | 0;
			if (!D) t = 256 - (r & 255) | 0;
			else t = (d[s + (t + (D + -1)) >> 0] | 0) - (r & 255) | 0;
			c[m >> 2] = q + (_(1024 - (Wb(t) | 0) << 16 >> 16, E) | 0);
			F = F + 1 | 0
		}
		ic(I, U, l, 1);
		p = c[U >> 2] | 0;
		r = c[N + (p << 2) >> 2] | 0;
		a[f >> 0] = r;
		nd(f + 1 | 0, J + (p << 4) | 0, b[fa >> 1] | 0) | 0;
		p = b[fa >> 1] | 0;
		r = _(r << 24 >> 24, p << 16 >> 16) | 0;
		q = c[ba >> 2] | 0;
		o = 0;
		while (1) {
			if ((o | 0) >= (p << 16 >> 16 | 0)) break;
			b[g + (o << 1) >> 1] = d[q + (r + o) >> 0] << 7;
			p = b[fa >> 1] | 0;
			o = o + 1 | 0
		}
		Nb(ca, da, h, a[f >> 0] | 0);
		s = b[fa >> 1] | 0;
		o = b[O >> 1] | 0;
		q = 0;
		p = s;
		while (1) {
			n = p + -1 | 0;
			if ((p | 0) <= 0) break;
			r = (_(q << 16 >> 16, d[da + n >> 0] | 0) | 0) >> 8;
			q = a[f + p >> 0] | 0;
			p = q << 24 >> 24 << 10;
			if (q << 24 >> 24 > 0) q = p + -102 | 0;
			else q = q << 24 >> 24 < 0 ? p | 102 : p;
			q = r + ((_(q >> 16, o) | 0) + ((_(q & 65535, o) | 0) >> 16)) | 0;
			b[ha + (n << 1) >> 1] = q;
			p = n
		}
		ac(ga, g, s);
		r = 0;
		while (1) {
			n = b[fa >> 1] | 0;
			if ((r | 0) >= (n | 0)) break;
			o = b[ga + (r << 1) >> 1] | 0;
			n = (o & 65535) << 16;
			if ((n | 0) < 1) n = 0;
			else {
				if (!(o << 16 >> 16)) q = 32;
				else q = aa(n | 0) | 0;
				o = 24 - q | 0;
				p = 0 - o | 0;
				do
					if (o)
						if ((o | 0) < 0) {
							n = n << p | n >>> (o + 32 | 0);
							break
						} else {
							n = n << 32 - o | n >>> o;
							break
						}
				while (0);
				ca = ((q & 1 | 0) == 0 ? 46214 : 32768) >>> (q >>> 1);
				n = (_(n & 127, 13959168) | 0) >>> 16;
				n = ca + ((_(ca >> 16, n) | 0) + ((_(ca & 65535, n) | 0) >>> 16)) | 0
			}
			ca = g + (r << 1) | 0;
			ba = (b[ca >> 1] | 0) + ((b[ha + (r << 1) >> 1] << 14 | 0) / (n | 0) | 0) | 0;
			b[ca >> 1] = (ba | 0) > 32767 ? 32767 : (ba | 0) < 0 ? 0 : ba;
			r = r + 1 | 0
		}
		$b(g, c[ea >> 2] | 0, n);
		i = ia;
		return
	}

	function Nb(d, e, f, g) {
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

	function Ob(d, f, g, h, j, k, l, m, n, o, p) {
		d = d | 0;
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
		var q = 0,
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
			G = 0;
		E = i;
		i = i + 16 | 0;
		C = E + 8 | 0;
		w = E + 4 | 0;
		s = E;
		v = f + -4 | 0;
		u = p + 2 | 0;
		D = i;
		i = i + ((1 * (u << 1) | 0) + 15 & -16) | 0;
		t = 0;
		while (1) {
			if ((t | 0) >= (u | 0)) break;
			B = t + -2 | 0;
			q = b[f + (B << 1) >> 1] | 0;
			B = b[g + (B << 1) >> 1] | 0;
			A = q + B | 0;
			B = q - B | 0;
			b[f + (t + -2 << 1) >> 1] = (A >>> 1) + (A & 1);
			B = (B >> 1) + (B & 1) | 0;
			b[D + (t << 1) >> 1] = (B | 0) > 32767 ? 32767 : (B | 0) < -32768 ? -32768 : B;
			t = t + 1 | 0
		}
		r = d + 4 | 0;
		A = e[r >> 1] | e[r + 2 >> 1] << 16;
		b[v >> 1] = A;
		b[v + 2 >> 1] = A >>> 16;
		A = d + 8 | 0;
		x = e[A >> 1] | e[A + 2 >> 1] << 16;
		c[D >> 2] = x;
		y = f + (p + -2 << 1) | 0;
		y = e[y >> 1] | e[y + 2 >> 1] << 16;
		b[r >> 1] = y;
		b[r + 2 >> 1] = y >>> 16;
		r = D + (p << 1) | 0;
		r = e[r >> 1] | e[r + 2 >> 1] << 16;
		b[A >> 1] = r;
		b[A + 2 >> 1] = r >>> 16;
		A = i;
		i = i + ((1 * (p << 1) | 0) + 15 & -16) | 0;
		r = i;
		i = i + ((1 * (p << 1) | 0) + 15 & -16) | 0;
		y = 0;
		while (1) {
			if ((y | 0) >= (p | 0)) break;
			q = b[f + (y + -1 << 1) >> 1] | 0;
			B = ((b[f + (y + -2 << 1) >> 1] | 0) + (b[f + (y << 1) >> 1] | 0) + (q << 16 >> 16 << 1) >> 1) + 1 >> 1;
			b[A + (y << 1) >> 1] = B;
			b[r + (y << 1) >> 1] = (q & 65535) - B;
			y = y + 1 | 0
		}
		z = i;
		i = i + ((1 * (p << 1) | 0) + 15 & -16) | 0;
		q = i;
		i = i + ((1 * (p << 1) | 0) + 15 & -16) | 0;
		y = x & 65535;
		x = 0;
		while (1) {
			if ((x | 0) >= (p | 0)) break;
			B = x + 1 | 0;
			t = b[D + (B << 1) >> 1] | 0;
			u = ((y << 16 >> 16) + (b[D + (x + 2 << 1) >> 1] | 0) + (t << 16 >> 16 << 1) >> 1) + 1 >> 1;
			b[z + (x << 1) >> 1] = u;
			b[q + (x << 1) >> 1] = (t & 65535) - u;
			y = t;
			x = B
		}
		y = (o * 10 | 0) == (p | 0);
		B = y ? 328 : 655;
		t = m << 16 >> 16;
		t = _(t, t) | 0;
		B = (_(t >>> 16, B) | 0) + ((_(t & 65535, B) | 0) >>> 16) | 0;
		t = lc(w, A, z, d + 12 | 0, p, B) | 0;
		c[C >> 2] = t;
		A = lc(s, r, q, d + 20 | 0, p, B) | 0;
		u = C + 4 | 0;
		c[u >> 2] = A;
		m = (c[s >> 2] | 0) + ((c[w >> 2] << 16 >> 16) * 3 | 0) | 0;
		m = (m | 0) < 65536 ? m : 65536;
		l = l - (y ? 1200 : 600) | 0;
		l = (l | 0) < 1 ? 1 : l;
		z = ((o << 16 >> 16) * 900 | 0) + 2e3 | 0;
		y = m * 3 | 0;
		x = Pb(l, y + 851968 | 0, 19) | 0;
		c[k >> 2] = x;
		if ((x | 0) < (z | 0)) {
			c[k >> 2] = z;
			q = l - z | 0;
			c[k + 4 >> 2] = q;
			x = z << 16 >> 16;
			x = Pb((q << 1) - z | 0, (_(y + 65536 >> 16, x) | 0) + ((_(y & 65535, x) | 0) >> 16) | 0, 16) | 0;
			if ((x | 0) > 16384) y = 16384;
			else y = (x | 0) < 0 ? 0 : x
		} else {
			c[k + 4 >> 2] = l - x;
			y = 16384
		}
		x = d + 28 | 0;
		r = b[x >> 1] | 0;
		q = r & 65535;
		B = B << 16 >> 16;
		b[x >> 1] = q + ((_(y - (r << 16 >> 16) >> 16, B) | 0) + ((_(y - q & 65535, B) | 0) >>> 16));
		a[j >> 0] = 0;
		a: do
			if (!n) {
				v = l << 3;
				do
					if (!(b[d + 30 >> 1] | 0)) {
						if ((v | 0) >= (z * 13 | 0)) {
							r = b[x >> 1] | 0;
							n = r << 16 >> 16;
							if (((_(m >> 16, n) | 0) + ((_(m & 65535, n) | 0) >> 16) | 0) >= 819) {
								r = b[x >> 1] | 0;
								break
							}
						} else r = b[x >> 1] | 0;
						r = r << 16 >> 16;
						c[C >> 2] = (_(r, t << 16 >> 16) | 0) >> 14;
						c[u >> 2] = (_(r, A << 16 >> 16) | 0) >> 14;
						oc(C, h);
						c[C >> 2] = 0;
						c[u >> 2] = 0;
						c[k >> 2] = l;
						c[k + 4 >> 2] = 0;
						a[j >> 0] = 1;
						r = 0;
						v = 30;
						break a
					} else {
						if ((v | 0) >= (z * 11 | 0)) {
							r = b[x >> 1] | 0;
							n = r << 16 >> 16;
							if (((_(m >> 16, n) | 0) + ((_(m & 65535, n) | 0) >> 16) | 0) >= 328) break
						} else r = b[x >> 1] | 0;
						q = r << 16 >> 16;
						c[C >> 2] = (_(q, t << 16 >> 16) | 0) >> 14;
						c[u >> 2] = (_(q, A << 16 >> 16) | 0) >> 14;
						oc(C, h);
						c[C >> 2] = 0;
						c[u >> 2] = 0;
						q = 0;
						v = 29;
						break a
					}
				while (0);
				if (r << 16 >> 16 > 15565) {
					oc(C, h);
					q = 16384;
					v = 29;
					break
				} else {
					q = r << 16 >> 16;
					c[C >> 2] = (_(q, t << 16 >> 16) | 0) >> 14;
					c[u >> 2] = (_(q, A << 16 >> 16) | 0) >> 14;
					oc(C, h);
					q = b[x >> 1] | 0;
					v = 29;
					break
				}
			} else {
				c[C >> 2] = 0;
				c[u >> 2] = 0;
				oc(C, h);
				q = 0;
				v = 29
			}
		while (0);
		if ((v | 0) == 29)
			if ((a[j >> 0] | 0) == 1) {
				r = q;
				v = 30
			} else {
				b[d + 32 >> 1] = 0;
				v = 34
			}
		do
			if ((v | 0) == 30) {
				q = d + 32 | 0;
				h = (e[q >> 1] | 0) + (p - (o << 3)) | 0;
				b[q >> 1] = h;
				if ((h << 16 >> 16 | 0) < (o * 5 | 0)) {
					a[j >> 0] = 0;
					v = 35;
					break
				} else {
					b[q >> 1] = 1e4;
					q = r;
					v = 34;
					break
				}
			}
		while (0);
		if ((v | 0) == 34)
			if (!(a[j >> 0] | 0)) {
				r = q;
				v = 35
			}
		if ((v | 0) == 35) {
			q = k + 4 | 0;
			if ((c[q >> 2] | 0) < 1) {
				c[q >> 2] = 1;
				c[k >> 2] = (l | 0) < 2 ? 1 : l + -1 | 0;
				q = r
			} else q = r
		}
		t = b[d >> 1] | 0;
		B = d + 2 | 0;
		s = b[B >> 1] | 0;
		m = d + 30 | 0;
		k = b[m >> 1] | 0;
		x = k << 16 >> 16;
		r = o << 3;
		A = c[C >> 2] | 0;
		w = (65536 / (r | 0) | 0) << 16 >> 16;
		y = ((_(A - (t & 65535) << 16 >> 16, w) | 0) >> 15) + 1 >> 1;
		z = c[u >> 2] | 0;
		v = ((_(z - (s & 65535) << 16 >> 16, w) | 0) >> 15) + 1 >> 1;
		u = (_(q - x >> 16, w) | 0) + ((_(q - (k & 65535) & 65535, w) | 0) >> 16) << 10;
		t = 0 - (t << 16 >> 16) | 0;
		s = 0 - (s << 16 >> 16) | 0;
		w = 0;
		x = x << 10;
		while (1) {
			if ((w | 0) >= (r | 0)) break;
			j = t - y | 0;
			k = s - v | 0;
			C = x + u | 0;
			o = w + 1 | 0;
			n = b[f + (w + -1 << 1) >> 1] | 0;
			F = (b[f + (w + -2 << 1) >> 1] | 0) + (b[f + (w << 1) >> 1] | 0) + (n << 1) | 0;
			G = b[D + (o << 1) >> 1] | 0;
			l = j << 16 >> 16;
			h = k << 16 >> 16;
			h = ((_(C >> 16, G) | 0) + ((_(C & 64512, G) | 0) >> 16) + ((_(F >> 7, l) | 0) + ((_(F << 9 & 65024, l) | 0) >> 16)) + ((_(n >> 5, h) | 0) + ((_(n << 11 & 63488, h) | 0) >> 16)) >> 7) + 1 >> 1;
			b[g + (w + -1 << 1) >> 1] = (h | 0) > 32767 ? 32767 : (h | 0) < -32768 ? -32768 : h;
			t = j;
			s = k;
			w = o;
			x = C
		}
		s = q >> 6;
		t = q << 10 & 64512;
		u = 0 - A << 16 >> 16;
		v = 0 - z << 16 >> 16;
		while (1) {
			if ((r | 0) >= (p | 0)) break;
			C = r + 1 | 0;
			o = b[f + (r + -1 << 1) >> 1] | 0;
			k = (b[f + (r + -2 << 1) >> 1] | 0) + (b[f + (r << 1) >> 1] | 0) + (o << 1) | 0;
			j = b[D + (C << 1) >> 1] | 0;
			o = ((_(s, j) | 0) + ((_(t, j) | 0) >> 16) + ((_(k >> 7, u) | 0) + ((_(k << 9 & 65024, u) | 0) >> 16)) + ((_(o >> 5, v) | 0) + ((_(o << 11 & 63488, v) | 0) >> 16)) >> 7) + 1 >> 1;
			b[g + (r + -1 << 1) >> 1] = (o | 0) > 32767 ? 32767 : (o | 0) < -32768 ? -32768 : o;
			r = C
		}
		b[d >> 1] = A;
		b[B >> 1] = z;
		b[m >> 1] = q;
		i = E;
		return
	}

	function Pb(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0;
		if ((a | 0) <= 0) {
			e = 0 - a | 0;
			if (!e) d = 31;
			else g = 3
		} else {
			e = a;
			g = 3
		}
		if ((g | 0) == 3) d = (aa(e | 0) | 0) + -1 | 0;
		f = a << d;
		if ((b | 0) <= 0) {
			e = 0 - b | 0;
			if (!e) e = 31;
			else g = 6
		} else {
			e = b;
			g = 6
		}
		if ((g | 0) == 6) e = (aa(e | 0) | 0) + -1 | 0;
		g = b << e;
		a = (536870911 / (g >> 16 | 0) | 0) << 16 >> 16;
		b = (_(f >> 16, a) | 0) + ((_(f & 65535, a) | 0) >> 16) | 0;
		g = ud(g | 0, ((g | 0) < 0) << 31 >> 31 | 0, b | 0, ((b | 0) < 0) << 31 >> 31 | 0) | 0;
		g = md(g | 0, C | 0, 29) | 0;
		f = f - (g & -8) | 0;
		f = b + ((_(f >> 16, a) | 0) + ((_(f & 65535, a) | 0) >> 16)) | 0;
		d = d + 29 - e - c | 0;
		if ((d | 0) >= 0) return ((d | 0) < 32 ? f >> d : 0) | 0;
		d = 0 - d | 0;
		a = -2147483648 >> d;
		e = 2147483647 >>> d;
		if ((a | 0) > (e | 0)) {
			if ((f | 0) > (a | 0)) {
				d = a << d;
				return d | 0
			}
			a = (f | 0) < (e | 0) ? e : f;
			d = a << d;
			return d | 0
		} else {
			if ((f | 0) > (e | 0)) {
				a = e;
				d = a << d;
				return d | 0
			}
			a = (f | 0) < (a | 0) ? a : f;
			d = a << d;
			return d | 0
		}
		return 0
	}

	function Qb(a, b) {
		a = a | 0;
		b = b | 0;
		var d = 0,
			e = 0;
		id(a | 0, 0, 12240) | 0;
		c[a + 5124 >> 2] = b;
		b = ((Wb(3932160) | 0) << 8) + -524288 | 0;
		c[a + 8 >> 2] = b;
		c[a + 12 >> 2] = b;
		c[a + 4696 >> 2] = 1;
		b = a + 32 | 0;
		d = b + 112 | 0;
		do {
			c[b >> 2] = 0;
			b = b + 4 | 0
		} while ((b | 0) < (d | 0));
		b = 0;
		while (1) {
			if ((b | 0) == 4) {
				b = 0;
				break
			}
			d = b + 1 | 0;
			e = 50 / (d | 0) | 0;
			c[a + 124 + (b << 2) >> 2] = (e | 0) > 1 ? e : 1;
			b = d
		}
		while (1) {
			if ((b | 0) == 4) break;
			d = (c[a + 124 + (b << 2) >> 2] | 0) * 100 | 0;
			c[a + 92 + (b << 2) >> 2] = d;
			c[a + 108 + (b << 2) >> 2] = 2147483647 / (d | 0) | 0;
			b = b + 1 | 0
		}
		c[a + 140 >> 2] = 15;
		b = 0;
		while (1) {
			if ((b | 0) == 4) break;
			c[a + 72 + (b << 2) >> 2] = 25600;
			b = b + 1 | 0
		}
		return 0
	}

	function Rb(a, d) {
		a = a | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			h = 0,
			j = 0.0,
			l = 0,
			m = 0.0,
			n = 0,
			o = 0,
			p = 0,
			q = 0,
			r = 0,
			s = 0,
			t = 0,
			u = 0;
		u = i;
		i = i + 304 | 0;
		r = u;
		p = a + 4600 | 0;
		f = c[p >> 2] | 0;
		if ((f | 0) == (d | 0) ? (e = a + 4580 | 0, (c[a + 4584 >> 2] | 0) == (c[e >> 2] | 0)) : 0) {
			p = e;
			d = 0;
			p = c[p >> 2] | 0;
			q = a + 4584 | 0;
			c[q >> 2] = p;
			i = u;
			return d | 0
		}
		if (!f) {
			q = a + 4580 | 0;
			p = q;
			d = bc(a + 5808 | 0, c[q >> 2] | 0, d * 1e3 | 0, 1) | 0;
			p = c[p >> 2] | 0;
			q = a + 4584 | 0;
			c[q >> 2] = p;
			i = u;
			return d | 0
		}
		q = ((c[a + 4604 >> 2] | 0) * 10 | 0) + 5 | 0;
		o = _(q, f) | 0;
		e = _(q, d) | 0;
		s = na() | 0;
		t = i;
		i = i + ((1 * (((o | 0) > (e | 0) ? o : e) << 1) | 0) + 15 & -16) | 0;
		h = o;
		while (1) {
			f = h + -1 | 0;
			if ((h | 0) <= 0) break;
			j = +g[a + 9356 + (f << 2) >> 2];
			l = (g[k >> 2] = j, c[k >> 2] | 0);
			h = (l & 2130706432) >>> 0 > 1249902592;
			if (!h) {
				n = (l | 0) < 0;
				m = n ? j + -8388608.0 + 8388608.0 : j + 8388608.0 + -8388608.0;
				if (m == 0.0) m = n ? -0.0 : 0.0
			} else m = j;
			if ((~~m | 0) <= 32767) {
				if (!h) {
					n = (l | 0) < 0;
					m = n ? j + -8388608.0 + 8388608.0 : j + 8388608.0 + -8388608.0;
					if (m == 0.0) m = n ? -0.0 : 0.0
				} else m = j;
				if ((~~m | 0) < -32768) h = -32768;
				else {
					if (!h) {
						h = (l | 0) < 0;
						j = h ? j + -8388608.0 + 8388608.0 : j + 8388608.0 + -8388608.0;
						if (j == 0.0) j = h ? -0.0 : 0.0
					}
					h = ~~j
				}
			} else h = 32767;
			b[t + (f << 1) >> 1] = h;
			h = f
		}
		n = a + 4580 | 0;
		l = bc(r, (c[p >> 2] << 16 >> 16) * 1e3 | 0, c[n >> 2] | 0, 0) | 0;
		q = _(q, (c[n >> 2] | 0) / 1e3 | 0) | 0;
		p = i;
		i = i + ((1 * (q << 1) | 0) + 15 & -16) | 0;
		cc(r, p, t, o);
		o = a + 5808 | 0;
		h = bc(o, c[n >> 2] | 0, (d << 16 >> 16) * 1e3 | 0, 1) | 0;
		cc(o, t, p, q);
		while (1) {
			f = e + -1 | 0;
			if ((e | 0) <= 0) break;
			g[a + 9356 + (f << 2) >> 2] = +(b[t + (f << 1) >> 1] | 0);
			e = f
		}
		ya(s | 0);
		p = n;
		d = l + h | 0;
		p = c[p >> 2] | 0;
		q = a + 4584 | 0;
		c[q >> 2] = p;
		i = u;
		return d | 0
	}

	function Sb(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0;
		c[b + (e << 2) >> 2] = 65536;
		c[d + (e << 2) >> 2] = 65536;
		f = 0;
		while (1) {
			if ((f | 0) >= (e | 0)) {
				f = e;
				break
			}
			g = a + (e - f + -1 << 2) | 0;
			h = a + (f + e << 2) | 0;
			c[b + (f << 2) >> 2] = 0 - (c[g >> 2] | 0) - (c[h >> 2] | 0);
			c[d + (f << 2) >> 2] = (c[h >> 2] | 0) - (c[g >> 2] | 0);
			f = f + 1 | 0
		}
		while (1) {
			if ((f | 0) <= 0) {
				a = 2;
				break
			}
			a = f + -1 | 0;
			g = b + (a << 2) | 0;
			c[g >> 2] = (c[g >> 2] | 0) - (c[b + (f << 2) >> 2] | 0);
			g = d + (a << 2) | 0;
			c[g >> 2] = (c[g >> 2] | 0) + (c[d + (f << 2) >> 2] | 0);
			f = a
		}
		while (1) {
			if ((a | 0) > (e | 0)) {
				f = 2;
				break
			} else f = e;
			while (1) {
				if ((f | 0) <= (a | 0)) break;
				g = b + (f + -2 << 2) | 0;
				c[g >> 2] = (c[g >> 2] | 0) - (c[b + (f << 2) >> 2] | 0);
				f = f + -1 | 0
			}
			f = b + (a + -2 << 2) | 0;
			c[f >> 2] = (c[f >> 2] | 0) - (c[b + (a << 2) >> 2] << 1);
			a = a + 1 | 0
		}
		while (1) {
			if ((f | 0) > (e | 0)) break;
			else a = e;
			while (1) {
				if ((a | 0) <= (f | 0)) break;
				b = d + (a + -2 << 2) | 0;
				c[b >> 2] = (c[b >> 2] | 0) - (c[d + (a << 2) >> 2] | 0);
				a = a + -1 | 0
			}
			a = d + (f + -2 << 2) | 0;
			c[a >> 2] = (c[a >> 2] | 0) - (c[d + (f << 2) >> 2] << 1);
			f = f + 1 | 0
		}
		return
	}

	function Tb(a, b, d) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0;
		e = c[a + (d << 2) >> 2] | 0;
		f = b << 4;
		if ((d | 0) == 8) {
			d = b << 20 >> 16;
			b = (f >> 15) + 1 >> 1;
			e = (c[a + 28 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a + 24 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a + 20 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a + 16 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a + 12 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a + 8 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a + 4 >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			e = (c[a >> 2] | 0) + ((_(e >> 16, d) | 0) + ((_(e & 65535, d) | 0) >> 16)) + (_(e, b) | 0) | 0;
			return e | 0
		}
		g = b << 20 >> 16;
		b = (f >> 15) + 1 >> 1;
		while (1) {
			f = d + -1 | 0;
			if ((d | 0) <= 0) break;
			d = f;
			e = (c[a + (f << 2) >> 2] | 0) + ((_(e >> 16, g) | 0) + ((_(e & 65535, g) | 0) >> 16)) + (_(e, b) | 0) | 0
		}
		return e | 0
	}

	function Ub(a, d, e, f, g) {
		a = a | 0;
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
			n = 0;
		g = g >> 1;
		h = d + 4 | 0;
		i = 0;
		while (1) {
			if ((i | 0) >= (g | 0)) break;
			m = i << 1;
			n = b[a + (m << 1) >> 1] << 10;
			l = n - (c[d >> 2] | 0) | 0;
			k = (_(l >> 16, -24290) | 0) + ((_(l & 65535, -24290) | 0) >> 16) | 0;
			j = n + k | 0;
			c[d >> 2] = n + (l + k);
			m = b[a + ((m | 1) << 1) >> 1] << 10;
			k = c[h >> 2] | 0;
			l = m - k | 0;
			l = ((l >> 16) * 10788 | 0) + (((l & 65535) * 10788 | 0) >>> 16) | 0;
			k = k + l | 0;
			c[h >> 2] = m + l;
			l = (k + j >> 10) + 1 >> 1;
			b[e + (i << 1) >> 1] = (l | 0) > 32767 ? 32767 : (l | 0) < -32768 ? -32768 : l;
			j = (k - j >> 10) + 1 >> 1;
			b[f + (i << 1) >> 1] = (j | 0) > 32767 ? 32767 : (j | 0) < -32768 ? -32768 : j;
			i = i + 1 | 0
		}
		return
	}

	function Vb(a, b, d) {
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

	function Wb(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0;
		if (!a) d = 32;
		else d = aa(a | 0) | 0;
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
		a = a & 127;
		return (31 - d << 7) + (a + (((_(a, 128 - a | 0) | 0) * 179 | 0) >>> 16)) | 0
	}

	function Xb(a) {
		a = a | 0;
		var b = 0,
			c = 0,
			d = 0;
		if ((a | 0) < 0) {
			b = 0;
			return b | 0
		}
		if ((a | 0) > 3966) {
			b = 2147483647;
			return b | 0
		}
		b = a >> 7;
		d = 1 << b;
		c = a & 127;
		if ((a | 0) < 2048) b = c + ((_(_(c, 128 - c | 0) | 0, -174) | 0) >> 16) << b >> 7;
		else b = _(d >> 7, c + ((_(_(c, 128 - c | 0) | 0, -174) | 0) >> 16) | 0) | 0;
		b = d + b | 0;
		return b | 0
	}

	function Yb(a, c, d, e, f, g) {
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
		id(a | 0, 0, f << 1 | 0) | 0;
		return
	}

	function Zb(a, e, f) {
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
		z = i;
		i = i + 336 | 0;
		w = z + 200 | 0;
		j = z + 136 | 0;
		k = z + 100 | 0;
		l = z + 64 | 0;
		x = z;
		h = (f | 0) == 16 ? 36207 : 36223;
		g = 0;
		while (1) {
			if ((g | 0) >= (f | 0)) break;
			o = b[e + (g << 1) >> 1] | 0;
			p = o >> 8;
			n = b[30758 + (p << 1) >> 1] | 0;
			p = ((n << 8) + (_((b[30758 + (p + 1 << 1) >> 1] | 0) - n | 0, o - (p << 8) | 0) | 0) >> 3) + 1 >> 1;
			c[j + (d[h + g >> 0] << 2) >> 2] = p;
			g = g + 1 | 0
		}
		h = f >> 1;
		_b(k, j, h);
		_b(l, j + 4 | 0, h);
		e = 0;
		while (1) {
			if ((e | 0) >= (h | 0)) break;
			p = e + 1 | 0;
			o = (c[k + (p << 2) >> 2] | 0) + (c[k + (e << 2) >> 2] | 0) | 0;
			n = (c[l + (p << 2) >> 2] | 0) - (c[l + (e << 2) >> 2] | 0) | 0;
			c[x + (e << 2) >> 2] = 0 - n - o;
			c[x + (f - e + -1 << 2) >> 2] = n - o;
			e = p
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
				p = c[x + (h << 2) >> 2] | 0;
				p = (p | 0) > 0 ? p : 0 - p | 0;
				o = (p | 0) > (e | 0);
				g = o ? h : g;
				e = o ? p : e;
				h = h + 1 | 0
			}
			e = (e >> 4) + 1 >> 1;
			if ((e | 0) <= 32767) break;
			p = (e | 0) < 163838 ? e : 163838;
			Vb(x, f, 65470 - (((p << 14) + -536854528 | 0) / ((_(p, g + 1 | 0) | 0) >> 2 | 0) | 0) | 0);
			j = j + 1 | 0
		}
		a: do
			if ((j | 0) == 10) {
				g = 0;
				while (1) {
					if ((g | 0) >= (f | 0)) break a;
					p = x + (g << 2) | 0;
					o = (c[p >> 2] >> 4) + 1 >> 1;
					o = (o | 0) > 32767 ? 32767 : (o | 0) < -32768 ? -32768 : o;
					b[a + (g << 1) >> 1] = o;
					c[p >> 2] = o << 16 >> 11;
					g = g + 1 | 0
				}
			} else {
				g = 0;
				while (1) {
					if ((g | 0) >= (f | 0)) break a;
					b[a + (g << 1) >> 1] = (((c[x + (g << 2) >> 2] | 0) >>> 4) + 1 | 0) >>> 1;
					g = g + 1 | 0
				}
			}
		while (0);
		u = f & 1;
		v = 0;
		b: while (1) {
			if ((v | 0) >= 16) {
				y = 54;
				break
			}
			e = 0;
			g = 0;
			while (1) {
				if ((g | 0) >= (f | 0)) break;
				p = b[a + (g << 1) >> 1] | 0;
				c[w + (u << 6) + (g << 2) >> 2] = p << 12;
				e = e + p | 0;
				g = g + 1 | 0
			}
			c: do
				if ((e | 0) <= 4095) {
					s = u;
					m = 1073741824;
					h = f;
					while (1) {
						t = h + -1 | 0;
						if ((h | 0) <= 1) break;
						h = c[w + (s << 6) + (t << 2) >> 2] | 0;
						if ((h | 0) > 16773022 | (h | 0) < -16773022) {
							y = 48;
							break c
						}
						q = 0 - (h << 7) | 0;
						r = ((q | 0) < 0) << 31 >> 31;
						ud(q | 0, r | 0, q | 0, r | 0) | 0;
						n = 1073741824 - C | 0;
						if ((n | 0) <= 0) {
							l = 0 - n | 0;
							if (!l) {
								k = 30;
								j = 0
							} else {
								j = 32 - (aa(l | 0) | 0) | 0;
								k = j + 30 | 0
							}
							l = 0 - n | 0;
							if (!l) {
								l = 32;
								p = j
							} else y = 31
						} else {
							k = 32 - (aa(n | 0) | 0) | 0;
							l = n;
							j = k;
							k = k + 30 | 0;
							y = 31
						}
						if ((y | 0) == 31) {
							y = 0;
							l = aa(l | 0) | 0;
							p = j
						}
						o = n << l + -1;
						g = o >> 16;
						h = 536870911 / (g | 0) | 0;
						e = h << 16;
						j = e >> 16;
						o = 536870912 - ((_(g, j) | 0) + ((_(o & 65535, j) | 0) >> 16)) << 3;
						h = e + ((_(o >> 16, j) | 0) + ((_(o & 65528, j) | 0) >> 16)) + (_(o, (h >> 15) + 1 >> 1) | 0) | 0;
						l = 62 - l - k | 0;
						if ((l | 0) < 1) {
							j = 0 - l | 0;
							k = -2147483648 >> j;
							l = 2147483647 >>> j;
							if ((k | 0) > (l | 0))
								if ((h | 0) > (k | 0)) l = k;
								else l = (h | 0) < (l | 0) ? l : h;
							else if ((h | 0) <= (l | 0)) l = (h | 0) < (k | 0) ? k : h;
							o = l << j
						} else o = (l | 0) < 32 ? h >> l : 0;
						e = ud(m | 0, ((m | 0) < 0) << 31 >> 31 | 0, n | 0, ((n | 0) < 0) << 31 >> 31 | 0) | 0;
						e = md(e | 0, C | 0, 30) | 0;
						g = t & 1;
						m = (p | 0) == 1;
						n = ((o | 0) < 0) << 31 >> 31;
						j = p + -1 | 0;
						h = 0;
						while (1) {
							if ((t | 0) <= (h | 0)) break;
							k = c[w + (s << 6) + (h << 2) >> 2] | 0;
							l = c[w + (s << 6) + (t - h + -1 << 2) >> 2] | 0;
							l = ud(l | 0, ((l | 0) < 0) << 31 >> 31 | 0, q | 0, r | 0) | 0;
							l = md(l | 0, C | 0, 30) | 0;
							l = kd(l | 0, C | 0, 1, 0) | 0;
							l = md(l | 0, C | 0, 1) | 0;
							l = k - l | 0;
							l = ud(l | 0, ((l | 0) < 0) << 31 >> 31 | 0, o | 0, n | 0) | 0;
							k = C;
							if (m) {
								p = md(l | 0, k | 0, 1) | 0;
								l = kd(p | 0, C | 0, l & 1 | 0, 0) | 0
							} else {
								l = ld(l | 0, k | 0, j | 0) | 0;
								l = kd(l | 0, C | 0, 1, 0) | 0;
								l = md(l | 0, C | 0, 1) | 0
							}
							c[w + (g << 6) + (h << 2) >> 2] = l;
							h = h + 1 | 0
						}
						s = g;
						m = e & -4;
						h = t
					}
					e = c[w + (s << 6) >> 2] | 0;
					if (!((e | 0) > 16773022 | (e | 0) < -16773022)) {
						o = 0 - (e << 7) | 0;
						p = ((o | 0) < 0) << 31 >> 31;
						ud(o | 0, p | 0, o | 0, p | 0) | 0;
						p = 1073741824 - C | 0;
						p = ud(m | 0, ((m | 0) < 0) << 31 >> 31 | 0, p | 0, ((p | 0) < 0) << 31 >> 31 | 0) | 0;
						p = md(p | 0, C | 0, 30) | 0;
						if ((p & -4 | 0) >= 107374) {
							y = 54;
							break b
						}
					} else y = 48
				} else y = 48;
			while (0);
			if ((y | 0) == 48) y = 0;
			Vb(x, f, 65536 - (2 << v) | 0);
			e = 0;
			while (1) {
				if ((e | 0) >= (f | 0)) break;
				b[a + (e << 1) >> 1] = (((c[x + (e << 2) >> 2] | 0) >>> 4) + 1 | 0) >>> 1;
				e = e + 1 | 0
			}
			v = v + 1 | 0
		}
		if ((y | 0) == 54) {
			i = z;
			return
		}
	}

	function _b(a, b, d) {
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
			e = ud(i | 0, f | 0, e | 0, ((e | 0) < 0) << 31 >> 31 | 0) | 0;
			e = md(e | 0, C | 0, 15) | 0;
			e = kd(e | 0, C | 0, 1, 0) | 0;
			e = md(e | 0, C | 0, 1) | 0;
			g = j + 1 | 0;
			c[a + (g << 2) >> 2] = (h << 1) - e;
			e = j;
			while (1) {
				if ((e | 0) <= 1) break;
				j = c[a + (e + -2 << 2) >> 2] | 0;
				m = ud(i | 0, f | 0, h | 0, ((h | 0) < 0) << 31 >> 31 | 0) | 0;
				m = md(m | 0, C | 0, 15) | 0;
				m = kd(m | 0, C | 0, 1, 0) | 0;
				m = md(m | 0, C | 0, 1) | 0;
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

	function $b(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
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
			q = 0,
			r = 0,
			s = 0;
		n = d + -1 | 0;
		q = a + (n << 1) | 0;
		r = c + (d << 1) | 0;
		o = 0;
		while (1) {
			if ((o | 0) >= 20) break;
			f = b[a >> 1] | 0;
			g = b[c >> 1] | 0;
			j = f;
			i = 0;
			f = (f << 16 >> 16) - (g << 16 >> 16) | 0;
			h = 1;
			while (1) {
				if ((h | 0) > (n | 0)) break;
				k = b[a + (h << 1) >> 1] | 0;
				m = (k << 16 >> 16) - ((j << 16 >> 16) + (b[c + (h << 1) >> 1] | 0)) | 0;
				l = (m | 0) < (f | 0);
				j = k;
				i = l ? h : i;
				f = l ? m : f;
				h = h + 1 | 0
			}
			l = 32768 - ((b[q >> 1] | 0) + (b[r >> 1] | 0)) | 0;
			k = (l | 0) < (f | 0);
			m = k ? d : i;
			if (((k ? l : f) | 0) > -1) {
				p = 36;
				break
			}
			do
				if (!m) b[a >> 1] = g;
				else {
					if ((m | 0) == (d | 0)) {
						b[q >> 1] = 32768 - (e[r >> 1] | 0);
						break
					} else {
						g = 0;
						j = 0
					}
					while (1) {
						if ((j | 0) >= (m | 0)) break;
						g = g + (b[c + (j << 1) >> 1] | 0) | 0;
						j = j + 1 | 0
					}
					k = c + (m << 1) | 0;
					l = b[k >> 1] | 0;
					i = l >> 1;
					h = 32768;
					j = d;
					while (1) {
						if ((j | 0) <= (m | 0)) break;
						h = h - (b[c + (j << 1) >> 1] | 0) | 0;
						j = j + -1 | 0
					}
					f = g + i | 0;
					j = h - i | 0;
					g = a + (m + -1 << 1) | 0;
					s = b[g >> 1] | 0;
					h = a + (m << 1) | 0;
					i = b[h >> 1] | 0;
					i = ((s << 16 >> 16) + (i << 16 >> 16) >> 1) + ((s & 65535) + (i & 65535) & 1) | 0;
					if ((f | 0) > (j | 0))
						if ((i | 0) > (f | 0)) j = f;
						else j = (i | 0) < (j | 0) ? j : i;
					else if ((i | 0) <= (j | 0)) j = (i | 0) < (f | 0) ? f : i;
					m = j - (l >>> 1) | 0;
					b[g >> 1] = m;
					b[h >> 1] = m + (e[k >> 1] | 0)
				}
			while (0);
			o = o + 1 | 0
		}
		if ((p | 0) == 36) return;
		if ((o | 0) == 20) h = 1;
		else return;
		while (1) {
			if ((h | 0) >= (d | 0)) break;
			g = b[a + (h << 1) >> 1] | 0;
			j = h;
			while (1) {
				i = j + -1 | 0;
				if ((j | 0) <= 0) break;
				f = b[a + (i << 1) >> 1] | 0;
				if (g << 16 >> 16 >= f << 16 >> 16) break;
				b[a + (j << 1) >> 1] = f;
				j = i
			}
			b[a + (j << 1) >> 1] = g;
			h = h + 1 | 0
		}
		f = b[a >> 1] | 0;
		g = b[c >> 1] | 0;
		g = f << 16 >> 16 > g << 16 >> 16 ? f << 16 >> 16 : g << 16 >> 16;
		b[a >> 1] = g;
		f = 1;
		while (1) {
			if ((f | 0) >= (d | 0)) break;
			n = a + (f << 1) | 0;
			m = b[n >> 1] | 0;
			o = (g << 16 >> 16) + (b[c + (f << 1) >> 1] | 0) | 0;
			o = (m | 0) > (o | 0) ? m : o;
			b[n >> 1] = o;
			g = o;
			f = f + 1 | 0
		}
		f = b[q >> 1] | 0;
		g = 32768 - (b[r >> 1] | 0) | 0;
		g = (f | 0) < (g | 0) ? f : g;
		b[q >> 1] = g;
		f = d + -2 | 0;
		while (1) {
			if ((f | 0) <= -1) break;
			n = a + (f << 1) | 0;
			m = b[n >> 1] | 0;
			o = (g << 16 >> 16) - (b[c + (f + 1 << 1) >> 1] | 0) | 0;
			o = (m | 0) < (o | 0) ? m : o;
			b[n >> 1] = o;
			g = o;
			f = f + -1 | 0
		}
		return
	}

	function ac(a, c, d) {
		a = a | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0;
		g = b[c >> 1] | 0;
		e = g << 16 >> 16;
		f = (b[c + 2 >> 1] | 0) - e | 0;
		f = 131072 / (((f | 0) > 1 ? f : 1) | 0) | 0;
		e = (131072 / ((g << 16 >> 16 > 1 ? e : 1) | 0) | 0) + f | 0;
		b[a >> 1] = (e | 0) < 32767 ? e : 32767;
		d = d + -1 | 0;
		e = 1;
		while (1) {
			if ((e | 0) >= (d | 0)) break;
			i = e + 1 | 0;
			g = c + (i << 1) | 0;
			j = (b[g >> 1] | 0) - (b[c + (e << 1) >> 1] | 0) | 0;
			j = 131072 / (((j | 0) > 1 ? j : 1) | 0) | 0;
			h = j + f | 0;
			b[a + (e << 1) >> 1] = (h | 0) < 32767 ? h : 32767;
			h = e + 2 | 0;
			g = (b[c + (h << 1) >> 1] | 0) - (b[g >> 1] | 0) | 0;
			g = 131072 / (((g | 0) > 1 ? g : 1) | 0) | 0;
			j = j + g | 0;
			b[a + (i << 1) >> 1] = (j | 0) < 32767 ? j : 32767;
			e = h;
			f = g
		}
		e = 32768 - (b[c + (d << 1) >> 1] | 0) | 0;
		e = (131072 / (((e | 0) > 1 ? e : 1) | 0) | 0) + f | 0;
		b[a + (d << 1) >> 1] = (e | 0) < 32767 ? e : 32767;
		return
	}

	function bc(b, d, e, f) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		var g = 0,
			h = 0;
		id(b | 0, 0, 300) | 0;
		if (!f) {
			a: do
				if ((d | 0) >= 12e3)
					if ((d | 0) < 16e3) {
						switch (d | 0) {
							case 12e3:
								break a;
							default:
								f = -1
						}
						return f | 0
					} else {
						switch (d | 0) {
							case 16e3:
								break a;
							default:
								f = -1
						}
						return f | 0
					}
			else {
				switch (d | 0) {
					case 8e3:
						break a;
					default:
						f = -1
				}
				return f | 0
			}
			while (0);b: do
				if ((e | 0) < 16e3)
					if ((e | 0) < 12e3) {
						switch (e | 0) {
							case 8e3:
								break b;
							default:
								f = -1
						}
						return f | 0
					} else {
						switch (e | 0) {
							case 12e3:
								break b;
							default:
								f = -1
						}
						return f | 0
					}
			else {
				if ((e | 0) < 24e3) {
					switch (e | 0) {
						case 16e3:
							break b;
						default:
							f = -1
					}
					return f | 0
				}
				if ((e | 0) < 48e3) {
					switch (e | 0) {
						case 24e3:
							break b;
						default:
							f = -1
					}
					return f | 0
				} else {
					switch (e | 0) {
						case 48e3:
							break b;
						default:
							f = -1
					}
					return f | 0
				}
			}
			while (0);c[b + 292 >> 2] = a[((e >> 12) - ((e | 0) > 16e3 & 1) >> ((e | 0) > 24e3 & 1)) + -1 + (36489 + ((((d >> 12) - ((d | 0) > 16e3 & 1) >> ((d | 0) > 24e3 & 1)) + -1 | 0) * 5 | 0)) >> 0]
		}
		else {
			c: do
				if ((d | 0) < 16e3)
					if ((d | 0) < 12e3) {
						switch (d | 0) {
							case 8e3:
								break c;
							default:
								f = -1
						}
						return f | 0
					} else {
						switch (d | 0) {
							case 12e3:
								break c;
							default:
								f = -1
						}
						return f | 0
					}
			else {
				if ((d | 0) < 24e3) {
					switch (d | 0) {
						case 16e3:
							break c;
						default:
							f = -1
					}
					return f | 0
				}
				if ((d | 0) < 48e3) {
					switch (d | 0) {
						case 24e3:
							break c;
						default:
							f = -1
					}
					return f | 0
				} else {
					switch (d | 0) {
						case 48e3:
							break c;
						default:
							f = -1
					}
					return f | 0
				}
			}
			while (0);d: do
				if ((e | 0) >= 12e3)
					if ((e | 0) < 16e3) {
						switch (e | 0) {
							case 12e3:
								break d;
							default:
								f = -1
						}
						return f | 0
					} else {
						switch (e | 0) {
							case 16e3:
								break d;
							default:
								f = -1
						}
						return f | 0
					}
			else {
				switch (e | 0) {
					case 8e3:
						break d;
					default:
						f = -1
				}
				return f | 0
			}
			while (0);c[b + 292 >> 2] = a[((e >> 12) - ((e | 0) > 16e3 & 1) >> ((e | 0) > 24e3 & 1)) + -1 + (36474 + ((((d >> 12) - ((d | 0) > 16e3 & 1) >> ((d | 0) > 24e3 & 1)) + -1 | 0) * 3 | 0)) >> 0]
		}
		f = (d | 0) / 1e3 | 0;
		c[b + 284 >> 2] = f;
		c[b + 288 >> 2] = (e | 0) / 1e3 | 0;
		c[b + 268 >> 2] = f * 10;
		do
			if ((e | 0) > (d | 0)) {
				f = b + 264 | 0;
				if ((d << 1 | 0) == (e | 0)) {
					c[f >> 2] = 1;
					g = 0;
					break
				} else {
					c[f >> 2] = 2;
					g = 1;
					break
				}
			} else {
				f = b + 264 | 0;
				if ((e | 0) >= (d | 0)) {
					c[f >> 2] = 0;
					g = 0;
					break
				}
				c[f >> 2] = 3;
				f = e << 2;
				if ((f | 0) == (d * 3 | 0)) {
					c[b + 280 >> 2] = 3;
					c[b + 276 >> 2] = 18;
					c[b + 296 >> 2] = 31016;
					g = 0;
					break
				}
				g = e * 3 | 0;
				if ((g | 0) == (d << 1 | 0)) {
					c[b + 280 >> 2] = 2;
					c[b + 276 >> 2] = 18;
					c[b + 296 >> 2] = 31074;
					g = 0;
					break
				}
				if ((e << 1 | 0) == (d | 0)) {
					c[b + 280 >> 2] = 1;
					c[b + 276 >> 2] = 24;
					c[b + 296 >> 2] = 31114;
					g = 0;
					break
				}
				if ((g | 0) == (d | 0)) {
					c[b + 280 >> 2] = 1;
					c[b + 276 >> 2] = 36;
					c[b + 296 >> 2] = 31142;
					g = 0;
					break
				}
				if ((f | 0) == (d | 0)) {
					c[b + 280 >> 2] = 1;
					c[b + 276 >> 2] = 36;
					c[b + 296 >> 2] = 31182;
					g = 0;
					break
				}
				if ((e * 6 | 0) == (d | 0)) {
					c[b + 280 >> 2] = 1;
					c[b + 276 >> 2] = 36;
					c[b + 296 >> 2] = 31222;
					g = 0;
					break
				} else {
					f = -1;
					return f | 0
				}
			}
		while (0);
		f = ((d << (g | 14) | 0) / (e | 0) | 0) << 2;
		h = b + 272 | 0;
		c[h >> 2] = f;
		b = e << 16 >> 16;
		e = (e >> 15) + 1 >> 1;
		g = d << g;
		while (1) {
			if (((_(f >> 16, b) | 0) + ((_(f & 65535, b) | 0) >> 16) + (_(f, e) | 0) | 0) >= (g | 0)) {
				f = 0;
				break
			}
			d = f + 1 | 0;
			c[h >> 2] = d;
			f = d
		}
		return f | 0
	}

	function cc(a, b, d, e) {
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
		nd(a + 168 + (i << 1) | 0, d | 0, h << 1 | 0) | 0;
		switch (c[a + 264 >> 2] | 0) {
			case 1:
				{
					hc(a, b, a + 168 | 0, c[a + 284 >> 2] | 0);hc(a, b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) | 0);
					break
				}
			case 2:
				{
					gc(a, b, a + 168 | 0, c[a + 284 >> 2] | 0);gc(a, b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) | 0);
					break
				}
			case 3:
				{
					fc(a, b, a + 168 | 0, c[a + 284 >> 2] | 0);fc(a, b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) | 0);
					break
				}
			default:
				{
					nd(b | 0, a + 168 | 0, c[f >> 2] << 1 | 0) | 0;nd(b + (c[a + 288 >> 2] << 1) | 0, d + (h << 1) | 0, e - (c[f >> 2] | 0) << 1 | 0) | 0
				}
		}
		f = c[g >> 2] | 0;
		nd(a + 168 | 0, d + (e - f << 1) | 0, f << 1 | 0) | 0;
		return
	}

	function dc(a, d, e, f) {
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
		f = f >> 1;
		g = a + 4 | 0;
		h = 0;
		while (1) {
			if ((h | 0) >= (f | 0)) break;
			m = h << 1;
			l = b[e + (m << 1) >> 1] << 10;
			j = l - (c[a >> 2] | 0) | 0;
			k = (_(j >> 16, -25727) | 0) + ((_(j & 65535, -25727) | 0) >> 16) | 0;
			c[a >> 2] = l + (j + k);
			m = b[e + ((m | 1) << 1) >> 1] << 10;
			j = c[g >> 2] | 0;
			i = m - j | 0;
			i = ((i >> 16) * 9872 | 0) + (((i & 65535) * 9872 | 0) >>> 16) | 0;
			c[g >> 2] = m + i;
			i = (l + k + j + i >> 10) + 1 >> 1;
			b[d + (h << 1) >> 1] = (i | 0) > 32767 ? 32767 : (i | 0) < -32768 ? -32768 : i;
			h = h + 1 | 0
		}
		return
	}

	function ec(a, d, e, f, g) {
		a = a | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		var h = 0,
			i = 0,
			j = 0,
			k = 0,
			l = 0,
			m = 0;
		h = a + 4 | 0;
		i = f + 2 | 0;
		j = 0;
		while (1) {
			if ((j | 0) >= (g | 0)) break;
			l = (c[a >> 2] | 0) + (b[e + (j << 1) >> 1] << 8) | 0;
			c[d + (j << 2) >> 2] = l;
			l = l << 2;
			m = l >> 16;
			k = b[f >> 1] | 0;
			l = l & 65532;
			c[a >> 2] = (c[h >> 2] | 0) + ((_(m, k) | 0) + ((_(l, k) | 0) >> 16));
			k = b[i >> 1] | 0;
			c[h >> 2] = (_(m, k) | 0) + ((_(l, k) | 0) >> 16);
			j = j + 1 | 0
		}
		return
	}

	function fc(a, d, e, f) {
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
			S = 0;
		M = i;
		J = i;
		i = i + ((1 * ((c[a + 268 >> 2] | 0) + (c[a + 276 >> 2] | 0) << 2) | 0) + 15 & -16) | 0;
		K = a + 24 | 0;
		L = a + 276 | 0;
		nd(J | 0, K | 0, c[L >> 2] << 2 | 0) | 0;
		m = a + 296 | 0;
		n = c[m >> 2] | 0;
		o = n + 4 | 0;
		p = c[a + 272 >> 2] | 0;
		q = a + 268 | 0;
		r = a + 280 | 0;
		s = n + 6 | 0;
		t = n + 8 | 0;
		u = n + 10 | 0;
		v = n + 12 | 0;
		w = n + 14 | 0;
		x = n + 16 | 0;
		y = n + 18 | 0;
		z = n + 20 | 0;
		A = n + 22 | 0;
		B = n + 24 | 0;
		C = n + 26 | 0;
		D = n + 28 | 0;
		E = n + 30 | 0;
		F = n + 32 | 0;
		G = n + 34 | 0;
		H = n + 36 | 0;
		I = n + 38 | 0;
		while (1) {
			l = c[q >> 2] | 0;
			l = (f | 0) < (l | 0) ? f : l;
			ec(a, J + (c[L >> 2] << 2) | 0, e, c[m >> 2] | 0, l);
			k = l << 16;
			g = c[r >> 2] | 0;
			a: do switch (c[L >> 2] | 0) {
					case 18:
						{
							j = g << 16 >> 16;h = g + -1 | 0;g = 0;
							while (1) {
								if ((g | 0) >= (k | 0)) break a;
								N = g >> 16;
								O = (_(g & 65535, j) | 0) >> 16;
								P = O * 9 | 0;
								Q = c[J + (N << 2) >> 2] | 0;
								S = b[n + (P + 2 << 1) >> 1] | 0;
								S = (_(Q >> 16, S) | 0) + ((_(Q & 65535, S) | 0) >> 16) | 0;
								Q = c[J + (N + 1 << 2) >> 2] | 0;
								R = b[n + (P + 3 << 1) >> 1] | 0;
								R = S + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 2 << 2) >> 2] | 0;
								S = b[n + (P + 4 << 1) >> 1] | 0;
								S = R + ((_(Q >> 16, S) | 0) + ((_(Q & 65535, S) | 0) >> 16)) | 0;
								Q = c[J + (N + 3 << 2) >> 2] | 0;
								R = b[n + (P + 5 << 1) >> 1] | 0;
								R = S + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 4 << 2) >> 2] | 0;
								S = b[n + (P + 6 << 1) >> 1] | 0;
								S = R + ((_(Q >> 16, S) | 0) + ((_(Q & 65535, S) | 0) >> 16)) | 0;
								Q = c[J + (N + 5 << 2) >> 2] | 0;
								R = b[n + (P + 7 << 1) >> 1] | 0;
								R = S + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 6 << 2) >> 2] | 0;
								S = b[n + (P + 8 << 1) >> 1] | 0;
								S = R + ((_(Q >> 16, S) | 0) + ((_(Q & 65535, S) | 0) >> 16)) | 0;
								Q = c[J + (N + 7 << 2) >> 2] | 0;
								R = b[n + (P + 9 << 1) >> 1] | 0;
								R = S + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 8 << 2) >> 2] | 0;
								P = b[n + (P + 10 << 1) >> 1] | 0;
								P = R + ((_(Q >> 16, P) | 0) + ((_(Q & 65535, P) | 0) >> 16)) | 0;
								O = (h - O | 0) * 9 | 0;
								Q = c[J + (N + 17 << 2) >> 2] | 0;
								R = b[n + (O + 2 << 1) >> 1] | 0;
								R = P + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 16 << 2) >> 2] | 0;
								P = b[n + (O + 3 << 1) >> 1] | 0;
								P = R + ((_(Q >> 16, P) | 0) + ((_(Q & 65535, P) | 0) >> 16)) | 0;
								Q = c[J + (N + 15 << 2) >> 2] | 0;
								R = b[n + (O + 4 << 1) >> 1] | 0;
								R = P + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 14 << 2) >> 2] | 0;
								P = b[n + (O + 5 << 1) >> 1] | 0;
								P = R + ((_(Q >> 16, P) | 0) + ((_(Q & 65535, P) | 0) >> 16)) | 0;
								Q = c[J + (N + 13 << 2) >> 2] | 0;
								R = b[n + (O + 6 << 1) >> 1] | 0;
								R = P + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 12 << 2) >> 2] | 0;
								P = b[n + (O + 7 << 1) >> 1] | 0;
								P = R + ((_(Q >> 16, P) | 0) + ((_(Q & 65535, P) | 0) >> 16)) | 0;
								Q = c[J + (N + 11 << 2) >> 2] | 0;
								R = b[n + (O + 8 << 1) >> 1] | 0;
								R = P + ((_(Q >> 16, R) | 0) + ((_(Q & 65535, R) | 0) >> 16)) | 0;
								Q = c[J + (N + 10 << 2) >> 2] | 0;
								P = b[n + (O + 9 << 1) >> 1] | 0;
								P = R + ((_(Q >> 16, P) | 0) + ((_(Q & 65535, P) | 0) >> 16)) | 0;
								N = c[J + (N + 9 << 2) >> 2] | 0;
								O = b[n + (O + 10 << 1) >> 1] | 0;
								O = (P + ((_(N >> 16, O) | 0) + ((_(N & 65535, O) | 0) >> 16)) >> 5) + 1 >> 1;
								N = d;
								b[N >> 1] = (O | 0) > 32767 ? 32767 : (O | 0) < -32768 ? -32768 : O;
								d = N + 2 | 0;
								g = g + p | 0
							}
						}
					case 24:
						{
							g = 0;
							while (1) {
								if ((g | 0) >= (k | 0)) break a;
								h = g >> 16;
								j = (c[J + (h << 2) >> 2] | 0) + (c[J + (h + 23 << 2) >> 2] | 0) | 0;
								N = b[o >> 1] | 0;
								N = (_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16) | 0;
								j = (c[J + (h + 1 << 2) >> 2] | 0) + (c[J + (h + 22 << 2) >> 2] | 0) | 0;
								O = b[s >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 2 << 2) >> 2] | 0) + (c[J + (h + 21 << 2) >> 2] | 0) | 0;
								N = b[t >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 3 << 2) >> 2] | 0) + (c[J + (h + 20 << 2) >> 2] | 0) | 0;
								O = b[u >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 4 << 2) >> 2] | 0) + (c[J + (h + 19 << 2) >> 2] | 0) | 0;
								N = b[v >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 5 << 2) >> 2] | 0) + (c[J + (h + 18 << 2) >> 2] | 0) | 0;
								O = b[w >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 6 << 2) >> 2] | 0) + (c[J + (h + 17 << 2) >> 2] | 0) | 0;
								N = b[x >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 7 << 2) >> 2] | 0) + (c[J + (h + 16 << 2) >> 2] | 0) | 0;
								O = b[y >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 8 << 2) >> 2] | 0) + (c[J + (h + 15 << 2) >> 2] | 0) | 0;
								N = b[z >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 9 << 2) >> 2] | 0) + (c[J + (h + 14 << 2) >> 2] | 0) | 0;
								O = b[A >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 10 << 2) >> 2] | 0) + (c[J + (h + 13 << 2) >> 2] | 0) | 0;
								N = b[B >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								h = (c[J + (h + 11 << 2) >> 2] | 0) + (c[J + (h + 12 << 2) >> 2] | 0) | 0;
								j = b[C >> 1] | 0;
								j = (N + ((_(h >> 16, j) | 0) + ((_(h & 65535, j) | 0) >> 16)) >> 5) + 1 >> 1;
								h = d;
								b[h >> 1] = (j | 0) > 32767 ? 32767 : (j | 0) < -32768 ? -32768 : j;
								d = h + 2 | 0;
								g = g + p | 0
							}
						}
					case 36:
						{
							g = 0;
							while (1) {
								if ((g | 0) >= (k | 0)) break a;
								h = g >> 16;
								j = (c[J + (h << 2) >> 2] | 0) + (c[J + (h + 35 << 2) >> 2] | 0) | 0;
								N = b[o >> 1] | 0;
								N = (_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16) | 0;
								j = (c[J + (h + 1 << 2) >> 2] | 0) + (c[J + (h + 34 << 2) >> 2] | 0) | 0;
								O = b[s >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 2 << 2) >> 2] | 0) + (c[J + (h + 33 << 2) >> 2] | 0) | 0;
								N = b[t >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 3 << 2) >> 2] | 0) + (c[J + (h + 32 << 2) >> 2] | 0) | 0;
								O = b[u >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 4 << 2) >> 2] | 0) + (c[J + (h + 31 << 2) >> 2] | 0) | 0;
								N = b[v >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 5 << 2) >> 2] | 0) + (c[J + (h + 30 << 2) >> 2] | 0) | 0;
								O = b[w >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 6 << 2) >> 2] | 0) + (c[J + (h + 29 << 2) >> 2] | 0) | 0;
								N = b[x >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 7 << 2) >> 2] | 0) + (c[J + (h + 28 << 2) >> 2] | 0) | 0;
								O = b[y >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 8 << 2) >> 2] | 0) + (c[J + (h + 27 << 2) >> 2] | 0) | 0;
								N = b[z >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 9 << 2) >> 2] | 0) + (c[J + (h + 26 << 2) >> 2] | 0) | 0;
								O = b[A >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 10 << 2) >> 2] | 0) + (c[J + (h + 25 << 2) >> 2] | 0) | 0;
								N = b[B >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 11 << 2) >> 2] | 0) + (c[J + (h + 24 << 2) >> 2] | 0) | 0;
								O = b[C >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 12 << 2) >> 2] | 0) + (c[J + (h + 23 << 2) >> 2] | 0) | 0;
								N = b[D >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 13 << 2) >> 2] | 0) + (c[J + (h + 22 << 2) >> 2] | 0) | 0;
								O = b[E >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 14 << 2) >> 2] | 0) + (c[J + (h + 21 << 2) >> 2] | 0) | 0;
								N = b[F >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								j = (c[J + (h + 15 << 2) >> 2] | 0) + (c[J + (h + 20 << 2) >> 2] | 0) | 0;
								O = b[G >> 1] | 0;
								O = N + ((_(j >> 16, O) | 0) + ((_(j & 65535, O) | 0) >> 16)) | 0;
								j = (c[J + (h + 16 << 2) >> 2] | 0) + (c[J + (h + 19 << 2) >> 2] | 0) | 0;
								N = b[H >> 1] | 0;
								N = O + ((_(j >> 16, N) | 0) + ((_(j & 65535, N) | 0) >> 16)) | 0;
								h = (c[J + (h + 17 << 2) >> 2] | 0) + (c[J + (h + 18 << 2) >> 2] | 0) | 0;
								j = b[I >> 1] | 0;
								j = (N + ((_(h >> 16, j) | 0) + ((_(h & 65535, j) | 0) >> 16)) >> 5) + 1 >> 1;
								h = d;
								b[h >> 1] = (j | 0) > 32767 ? 32767 : (j | 0) < -32768 ? -32768 : j;
								d = h + 2 | 0;
								g = g + p | 0
							}
						}
					default:
						{}
				}
				while (0);
				f = f - l | 0;
			if ((f | 0) <= 1) break;
			nd(J | 0, J + (l << 2) | 0, c[L >> 2] << 2 | 0) | 0;
			e = e + (l << 1) | 0
		}
		nd(K | 0, J + (l << 2) | 0, c[L >> 2] << 2 | 0) | 0;
		i = M;
		return
	}

	function gc(a, d, e, f) {
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
			hc(a, k, e, j);
			h = j << 17;
			g = 0;
			while (1) {
				if ((g | 0) >= (h | 0)) break;
				r = ((g & 65535) * 12 | 0) >>> 16;
				q = g >> 16;
				s = _(b[l + (q << 1) >> 1] | 0, b[31274 + (r << 3) >> 1] | 0) | 0;
				s = s + (_(b[l + (q + 1 << 1) >> 1] | 0, b[31274 + (r << 3) + 2 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 2 << 1) >> 1] | 0, b[31274 + (r << 3) + 4 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 3 << 1) >> 1] | 0, b[31274 + (r << 3) + 6 >> 1] | 0) | 0) | 0;
				r = 11 - r | 0;
				s = s + (_(b[l + (q + 4 << 1) >> 1] | 0, b[31274 + (r << 3) + 6 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 5 << 1) >> 1] | 0, b[31274 + (r << 3) + 4 >> 1] | 0) | 0) | 0;
				s = s + (_(b[l + (q + 6 << 1) >> 1] | 0, b[31274 + (r << 3) + 2 >> 1] | 0) | 0) | 0;
				r = (s + (_(b[l + (q + 7 << 1) >> 1] | 0, b[31274 + (r << 3) >> 1] | 0) | 0) >> 14) + 1 >> 1;
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

	function hc(a, d, e, f) {
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

	function ic(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0,
			h = 0,
			i = 0,
			j = 0,
			k = 0;
		f = 0;
		while (1) {
			if ((f | 0) >= (e | 0)) {
				h = 1;
				break
			}
			c[b + (f << 2) >> 2] = f;
			f = f + 1 | 0
		}
		while (1) {
			if ((h | 0) >= (e | 0)) break;
			g = c[a + (h << 2) >> 2] | 0;
			j = h;
			while (1) {
				i = j + -1 | 0;
				if ((j | 0) <= 0) break;
				f = c[a + (i << 2) >> 2] | 0;
				if ((g | 0) >= (f | 0)) break;
				c[a + (j << 2) >> 2] = f;
				c[b + (j << 2) >> 2] = c[b + (i << 2) >> 2];
				j = i
			}
			c[a + (j << 2) >> 2] = g;
			c[b + (j << 2) >> 2] = h;
			h = h + 1 | 0
		}
		j = a + (e + -1 << 2) | 0;
		k = e + -2 | 0;
		h = e;
		while (1) {
			if ((h | 0) >= (d | 0)) break;
			f = c[a + (h << 2) >> 2] | 0;
			if ((f | 0) < (c[j >> 2] | 0)) {
				i = k;
				while (1) {
					if ((i | 0) <= -1) break;
					g = c[a + (i << 2) >> 2] | 0;
					if ((f | 0) >= (g | 0)) break;
					e = i + 1 | 0;
					c[a + (e << 2) >> 2] = g;
					c[b + (e << 2) >> 2] = c[b + (i << 2) >> 2];
					i = i + -1 | 0
				}
				g = i + 1 | 0;
				c[a + (g << 2) >> 2] = f;
				c[b + (g << 2) >> 2] = h
			}
			h = h + 1 | 0
		}
		return
	}

	function jc(a, d, e, f) {
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

	function kc(b, c) {
		b = b | 0;
		c = c | 0;
		var d = 0;
		hb(b, ((a[c + 2 >> 0] | 0) * 5 | 0) + (a[c + 5 >> 0] | 0) | 0, 34965, 8);
		d = 0;
		while (1) {
			if ((d | 0) == 2) break;
			hb(b, a[c + (d * 3 | 0) >> 0] | 0, 35006, 8);
			hb(b, a[c + (d * 3 | 0) + 1 >> 0] | 0, 35013, 8);
			d = d + 1 | 0
		}
		return
	}

	function lc(a, d, e, f, g, h) {
		a = a | 0;
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
			r = 0;
		p = i;
		i = i + 16 | 0;
		j = p + 12 | 0;
		l = p + 8 | 0;
		n = p + 4 | 0;
		m = p;
		jc(n, j, d, g);
		jc(m, l, e, g);
		j = c[j >> 2] | 0;
		l = c[l >> 2] | 0;
		k = (j | 0) > (l | 0) ? j : l;
		k = k + (k & 1) | 0;
		l = c[m >> 2] >> k - l;
		c[m >> 2] = l;
		j = c[n >> 2] >> k - j;
		c[n >> 2] = j;
		j = (j | 0) > 1 ? j : 1;
		c[n >> 2] = j;
		n = 0;
		o = 0;
		while (1) {
			if ((n | 0) >= (g | 0)) break;
			q = o + ((_(b[d + (n << 1) >> 1] | 0, b[e + (n << 1) >> 1] | 0) | 0) >> k) | 0;
			n = n + 1 | 0;
			o = q
		}
		n = mc(o, j, 13) | 0;
		n = (n | 0) > 16384 ? 16384 : (n | 0) < -16384 ? -16384 : n;
		e = n << 16 >> 16;
		d = (_(n >> 16, e) | 0) + ((_(n & 65535, e) | 0) >> 16) | 0;
		g = (d | 0) > 0 ? d : 0 - d | 0;
		k = k >> 1;
		r = c[f >> 2] | 0;
		q = ((nc(j) | 0) << k) - r | 0;
		g = ((g | 0) < (h | 0) ? h : g) << 16 >> 16;
		h = r + ((_(q >> 16, g) | 0) + ((_(q & 65535, g) | 0) >> 16)) | 0;
		c[f >> 2] = h;
		d = d << 16 >> 16;
		o = l - ((_(o >> 16, e) | 0) + ((_(o & 65535, e) | 0) >> 16) << 4) + ((_(j >> 16, d) | 0) + ((_(j & 65535, d) | 0) >> 16) << 6) | 0;
		c[m >> 2] = o;
		m = f + 4 | 0;
		f = c[m >> 2] | 0;
		o = ((nc(o) | 0) << k) - f | 0;
		o = f + ((_(o >> 16, g) | 0) + ((_(o & 65535, g) | 0) >> 16)) | 0;
		c[m >> 2] = o;
		o = mc(o, (h | 0) > 1 ? h : 1, 14) | 0;
		c[a >> 2] = o;
		c[a >> 2] = (o | 0) > 32767 ? 32767 : (o | 0) < 0 ? 0 : o;
		i = p;
		return n | 0
	}

	function mc(a, b, c) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		var d = 0,
			e = 0,
			f = 0,
			g = 0;
		if ((a | 0) <= 0) {
			e = 0 - a | 0;
			if (!e) d = 31;
			else g = 3
		} else {
			e = a;
			g = 3
		}
		if ((g | 0) == 3) d = (aa(e | 0) | 0) + -1 | 0;
		f = a << d;
		if ((b | 0) <= 0) {
			e = 0 - b | 0;
			if (!e) e = 31;
			else g = 6
		} else {
			e = b;
			g = 6
		}
		if ((g | 0) == 6) e = (aa(e | 0) | 0) + -1 | 0;
		g = b << e;
		a = (536870911 / (g >> 16 | 0) | 0) << 16 >> 16;
		b = (_(f >> 16, a) | 0) + ((_(f & 65535, a) | 0) >> 16) | 0;
		g = ud(g | 0, ((g | 0) < 0) << 31 >> 31 | 0, b | 0, ((b | 0) < 0) << 31 >> 31 | 0) | 0;
		g = md(g | 0, C | 0, 29) | 0;
		f = f - (g & -8) | 0;
		f = b + ((_(f >> 16, a) | 0) + ((_(f & 65535, a) | 0) >> 16)) | 0;
		d = d + 29 - e - c | 0;
		if ((d | 0) >= 0) return ((d | 0) < 32 ? f >> d : 0) | 0;
		d = 0 - d | 0;
		a = -2147483648 >> d;
		e = 2147483647 >>> d;
		if ((a | 0) > (e | 0)) {
			if ((f | 0) > (a | 0)) {
				d = a << d;
				return d | 0
			}
			a = (f | 0) < (e | 0) ? e : f;
			d = a << d;
			return d | 0
		} else {
			if ((f | 0) > (e | 0)) {
				a = e;
				d = a << d;
				return d | 0
			}
			a = (f | 0) < (a | 0) ? a : f;
			d = a << d;
			return d | 0
		}
		return 0
	}

	function nc(a) {
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

	function oc(d, e) {
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
			q = 0,
			r = 0;
		f = 0;
		r = 0;
		while (1) {
			if ((r | 0) == 2) break;
			p = d + (r << 2) | 0;
			q = e + (r * 3 | 0) | 0;
			o = e + (r * 3 | 0) + 1 | 0;
			h = 2147483647;
			g = 0;
			a: while (1) {
				if ((g | 0) >= 15) break;
				l = b[30712 + (g << 1) >> 1] | 0;
				m = g + 1 | 0;
				n = b[30712 + (m << 1) >> 1] | 0;
				n = (_((n << 16 >> 16) - l >> 16, 429522944) | 0) + (((n & 65535) - l & 65535) * 6554 | 0) >> 16;
				k = g & 255;
				j = h;
				i = 0;
				while (1) {
					if ((i | 0) >= 5) {
						h = j;
						g = m;
						continue a
					}
					g = l + (_(n, i << 17 >> 16 | 1) | 0) | 0;
					h = c[p >> 2] | 0;
					h = (h | 0) > (g | 0) ? h - g | 0 : g - h | 0;
					if ((h | 0) >= (j | 0)) break a;
					a[q >> 0] = k;
					a[o >> 0] = i;
					j = h;
					f = g;
					i = i + 1 | 0
				}
			}
			n = a[q >> 0] | 0;
			o = (n << 24 >> 24 | 0) / 3 | 0;
			a[e + (r * 3 | 0) + 2 >> 0] = o;
			a[q >> 0] = (n & 255) + (_(o, -3) | 0);
			c[p >> 2] = f;
			r = r + 1 | 0
		}
		c[d >> 2] = (c[d >> 2] | 0) - (c[d + 4 >> 2] | 0);
		return
	}

	function pc(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0.0,
			f = 0.0,
			h = 0.0,
			i = 0.0,
			j = 0;
		f = 3.1415927410125732 / +(d + 1 | 0);
		h = 2.0 - f * f;
		c = (c | 0) < 2;
		e = c ? 0.0 : 1.0;
		f = c ? f : h * .5;
		c = 0;
		while (1) {
			if ((c | 0) >= (d | 0)) break;
			g[a + (c << 2) >> 2] = +g[b + (c << 2) >> 2] * .5 * (e + f);
			j = c | 1;
			g[a + (j << 2) >> 2] = +g[b + (j << 2) >> 2] * f;
			i = h * f - e;
			j = c | 2;
			g[a + (j << 2) >> 2] = +g[b + (j << 2) >> 2] * .5 * (f + i);
			j = c | 3;
			g[a + (j << 2) >> 2] = +g[b + (j << 2) >> 2] * i;
			e = i;
			f = h * i - f;
			c = c + 4 | 0
		}
		return
	}

	function qc(b) {
		b = b | 0;
		var d = 0,
			e = 0,
			f = 0;
		Kb(b, b + 5130 | 0);
		if ((c[b + 4556 >> 2] | 0) >= 13) {
			c[b + 6116 >> 2] = 0;
			c[b + 6112 >> 2] = 0;
			a[b + 4797 >> 0] = 1;
			a[(c[b + 5780 >> 2] | 0) + (b + 4752) >> 0] = 1;
			return
		}
		a[b + 4797 >> 0] = 0;
		d = b + 6116 | 0;
		e = c[d >> 2] | 0;
		f = e + 1 | 0;
		c[d >> 2] = f;
		if ((f | 0) >= 10) {
			if ((e | 0) > 29) {
				c[d >> 2] = 10;
				c[b + 6112 >> 2] = 0
			}
		} else c[b + 6112 >> 2] = 0;
		a[(c[b + 5780 >> 2] | 0) + (b + 4752) >> 0] = 0;
		return
	}

	function Oc(a, d, e, f, h, j, l, m, n, o, p, q) {
		a = a | 0;
		d = d | 0;
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
		var r = 0.0,
			s = 0,
			t = 0.0,
			u = 0.0,
			v = 0.0,
			w = 0.0,
			x = 0,
			y = 0.0,
			z = 0.0,
			A = 0,
			B = 0.0,
			C = 0.0,
			D = 0,
			E = 0,
			F = 0,
			G = 0.0,
			H = 0.0,
			I = 0.0,
			J = 0,
			K = 0,
			L = 0,
			Q = 0,
			R = 0,
			S = 0,
			T = 0,
			U = 0,
			V = 0,
			W = 0,
			X = 0,
			Z = 0,
			_ = 0,
			$ = 0,
			aa = 0,
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
			Da = 0,
			Ea = 0,
			Fa = 0,
			Ga = 0,
			Ha = 0,
			Ia = 0,
			Ja = 0,
			Ka = 0,
			La = 0,
			Ma = 0,
			Na = 0.0,
			Oa = 0.0;
		Ma = i;
		i = i + 10304 | 0;
		Fa = Ma + 9904 | 0;
		Ba = Ma + 9832 | 0;
		Ha = Ma + 9760 | 0;
		za = Ma + 9728 | 0;
		Da = Ma + 9624 | 0;
		Ea = Ma + 9616 | 0;
		Ia = Ma + 9608 | 0;
		Ga = Ma + 5768 | 0;
		Ka = Ma + 1928 | 0;
		La = Ma + 968 | 0;
		Ja = Ma + 8 | 0;
		Aa = Ma;
		if (!e) s = a + 8500 | 0;
		else {
			ua = (n * 195 | 0) / 100 | 0;
			ua = (ua | 0) < (f | 0) ? ua : f;
			va = a + 6880 | 0;
			T = c[va >> 2] | 0;
			wa = a + 6860 | 0;
			xa = a + 6864 | 0;
			ya = a + 6840 | 0;
			U = d + 72 | 0;
			V = a + 5760 | 0;
			s = a + 8500 | 0;
			W = a + 2880 | 0;
			X = a + 4800 | 0;
			Z = a + 3840 | 0;
			_ = a + 6852 | 0;
			$ = (o | 0) < 8;
			aa = a + 6844 | 0;
			ba = a + 6848 | 0;
			ca = a + 5836 | 0;
			da = Da + 80 | 0;
			ea = Da + 84 | 0;
			fa = Da + 88 | 0;
			ga = Da + 92 | 0;
			ha = Da + 96 | 0;
			ia = Ea + 4 | 0;
			ja = a + 6884 | 0;
			ka = a + 7684 | 0;
			la = a + 6888 | 0;
			ma = a + 7688 | 0;
			na = a + 7680 | 0;
			oa = a + 8480 | 0;
			pa = a + 8496 | 0;
			qa = a + 8488 | 0;
			ra = a + 8492 | 0;
			sa = a + 8484 | 0;
			ta = a + 6856 | 0;
			R = o + -8 | 0;
			S = T;
			T = ua - T | 0;
			while (1) {
				x = (T | 0) > 480 ? 480 : T;
				c[Ia >> 2] = 0;
				c[wa >> 2] = (c[wa >> 2] | 0) + 1;
				f = c[xa >> 2] | 0;
				do
					if ((f | 0) > 19) {
						r = 1.0 / 20.0;
						if ((f | 0) > 49) {
							t = 1.0 / 50.0;
							if ((f | 0) > 999) {
								u = 1.0 / 1.0e3;
								J = 11;
								break
							} else {
								u = 1.0 / +(f + 1 | 0);
								J = 11;
								break
							}
						} else J = 10
					} else {
						r = 1.0 / +(f + 1 | 0);
						J = 10
					}
				while (0);
				if ((J | 0) == 10) {
					J = 0;
					t = 1.0 / +(f + 1 | 0);
					u = 1.0 / +(f + 1 | 0);
					if ((f | 0) < 4) {
						g[ya >> 2] = .5;
						n = c[U >> 2] | 0;
						if (!f) {
							c[V >> 2] = 240;
							f = 240
						} else J = 13
					} else J = 11
				}
				if ((J | 0) == 11) {
					n = c[U >> 2] | 0;
					J = 13
				}
				if ((J | 0) == 13) {
					J = 0;
					f = c[V >> 2] | 0
				}
				F = 720 - f | 0;
				Ca[p & 1](e, a + 2880 + (f << 2) | 0, (x | 0) < (F | 0) ? x : F, S, j, l, m);
				f = (c[V >> 2] | 0) + x | 0;
				do
					if ((f | 0) < 720) c[V >> 2] = f;
					else {
						L = c[s >> 2] | 0;
						Q = a + 8512 + (L * 28 | 0) | 0;
						c[s >> 2] = (L | 0) > 198 ? L + -199 | 0 : L + 1 | 0;
						f = 0;
						while (1) {
							if ((f | 0) == 240) break;
							C = +g[23604 + (f << 2) >> 2];
							g[Ga + (f << 3) >> 2] = C * +g[a + 2880 + (f << 2) >> 2];
							g[Ga + (f << 3) + 4 >> 2] = C * +g[a + 2880 + (f + 240 << 2) >> 2];
							F = 480 - f + -1 | 0;
							g[Ga + (F << 3) >> 2] = C * +g[a + 2880 + (F << 2) >> 2];
							g[Ga + (F << 3) + 4 >> 2] = C * +g[a + 2880 + (720 - f + -1 << 2) >> 2];
							f = f + 1 | 0
						}
						nd(W | 0, X | 0, 960) | 0;
						d = c[V >> 2] | 0;
						f = x + (d + -720) | 0;
						Ca[p & 1](e, Z, f, S + 720 - d | 0, j, l, m);
						c[V >> 2] = f + 240;
						v = +g[n + 4 >> 2];
						f = n + 44 | 0;
						d = 0;
						while (1) {
							if ((d | 0) >= (c[n >> 2] | 0)) break;
							C = +g[Ga + (d << 3) + 4 >> 2];
							g[Ka + (b[(c[f >> 2] | 0) + (d << 1) >> 1] << 3) >> 2] = v * +g[Ga + (d << 3) >> 2];
							g[Ka + (b[(c[f >> 2] | 0) + (d << 1) >> 1] << 3) + 4 >> 2] = v * C;
							d = d + 1 | 0
						}
						mb(n, Ka);
						C = +g[Ka >> 2];
						if (C != C | 0.0 != 0.0) {
							c[Q >> 2] = 0;
							break
						} else n = 1;
						while (1) {
							if ((n | 0) == 240) break;
							v = +g[Ka + (n << 3) >> 2];
							x = 480 - n | 0;
							y = +g[Ka + (x << 3) >> 2];
							w = +g[Ka + (n << 3) + 4 >> 2];
							z = +g[Ka + (x << 3) + 4 >> 2];
							B = +Pc(w - z, v + y) * .15915493667125702;
							x = a + (n << 2) | 0;
							C = B - +g[x >> 2];
							E = a + 960 + (n << 2) | 0;
							G = C - +g[E >> 2];
							z = +Pc(y - v, w + z) * .15915493667125702;
							B = z - B;
							C = B - C;
							G = G - +M(+(G + .5));
							w = G * G;
							C = C - +M(+(C + .5));
							g[Ja + (n << 2) >> 2] = +N(+G) + +N(+C);
							C = C * C;
							C = C * C;
							F = a + 1920 + (n << 2) | 0;
							g[La + (n << 2) >> 2] = 1.0 / ((+g[F >> 2] + w * w * 2.0 + C) * .25 * 62341.81640625 + 1.0) + -.014999999664723873;
							g[x >> 2] = z;
							g[E >> 2] = B;
							g[F >> 2] = C;
							n = n + 1 | 0
						}
						K = a + 8512 + (L * 28 | 0) + 16 | 0;
						g[K >> 2] = 0.0;
						a: do
							if (!(c[xa >> 2] | 0)) {
								n = 0;
								while (1) {
									if ((n | 0) == 18) {
										B = 0.0;
										E = 0;
										F = 0;
										A = 0;
										G = 0.0;
										H = 0.0;
										I = 0.0;
										D = 0;
										break a
									}
									g[a + 6416 + (n << 2) >> 2] = 1.0e10;
									g[a + 6488 + (n << 2) >> 2] = -1.0e10;
									n = n + 1 | 0
								}
							} else {
								B = 0.0;
								E = 0;
								F = 0;
								A = 0;
								G = 0.0;
								H = 0.0;
								I = 0.0;
								D = 0
							}
						while (0);
						while (1) {
							if ((D | 0) >= 18) break;
							o = D + 1 | 0;
							x = c[24564 + (o << 2) >> 2] | 0;
							f = 0;
							w = 0.0;
							n = c[24564 + (D << 2) >> 2] | 0;
							C = 0.0;
							while (1) {
								if ((n | 0) >= (x | 0)) break;
								Na = +g[Ka + (n << 3) >> 2];
								d = 480 - n | 0;
								y = +g[Ka + (d << 3) >> 2];
								z = +g[Ka + (n << 3) + 4 >> 2];
								v = +g[Ka + (d << 3) + 4 >> 2];
								v = Na * Na + y * y + z * z + v * v;
								z = C + v * +g[La + (n << 2) >> 2];
								f = (g[k >> 2] = (c[k >> 2] = f, +g[k >> 2]) + v, c[k >> 2] | 0);
								w = w + v * 2.0 * (.5 - +g[Ja + (n << 2) >> 2]);
								n = n + 1 | 0;
								C = z
							}
							z = (c[k >> 2] = f, +g[k >> 2]);
							if (!(z < 1.0e9) | (z != z | 0.0 != 0.0)) {
								J = 35;
								break
							}
							c[a + 5840 + ((c[_ >> 2] | 0) * 72 | 0) + (D << 2) >> 2] = f;
							y = z + 1.0000000036274937e-15;
							d = (g[k >> 2] = (c[k >> 2] = E, +g[k >> 2]) + w / y, c[k >> 2] | 0);
							v = z + 1.000000013351432e-10;
							B = B + +O(+v);
							v = +Y(+v);
							f = Ha + (D << 2) | 0;
							g[f >> 2] = v;
							x = a + 6416 + (D << 2) | 0;
							w = +g[x >> 2] + .009999999776482582;
							w = v < w ? v : w;
							g[x >> 2] = w;
							v = +g[f >> 2];
							n = a + 6488 + (D << 2) | 0;
							z = +g[n >> 2] + -.10000000149011612;
							z = v > z ? v : z;
							g[n >> 2] = z;
							if (z < w + 1.0) {
								z = z + .5;
								g[n >> 2] = z;
								w = w + -.5;
								g[x >> 2] = w
							}
							v = (+g[f >> 2] - w) / (z + 1.0000000036274937e-15 - w);
							z = 0.0;
							w = 0.0;
							x = 0;
							while (1) {
								if ((x | 0) == 8) break;
								Na = +g[a + 5840 + (x * 72 | 0) + (D << 2) >> 2];
								z = z + +O(+Na);
								w = w + Na;
								x = x + 1 | 0
							}
							w = z / +O(+(w * 8.0 + 1.0e-15));
							w = w > .9900000095367432 ? .9900000095367432 : w;
							w = w * w;
							w = w * w;
							n = (g[k >> 2] = (c[k >> 2] = F, +g[k >> 2]) + w, c[k >> 2] | 0);
							z = C / y;
							x = a + 5764 + (D << 2) | 0;
							w = w * +g[x >> 2];
							w = z > w ? z : w;
							g[Ba + (D << 2) >> 2] = w;
							z = (c[k >> 2] = A, +g[k >> 2]) + w;
							if ((D | 0) > 8) z = z - +g[Ba + (D + -9 << 2) >> 2];
							A = (g[k >> 2] = z, c[k >> 2] | 0);
							C = (+(D + -18 | 0) * .029999999329447746 + 1.0) * z;
							g[x >> 2] = w;
							E = d;
							F = n;
							G = G > C ? G : C;
							H = H + v;
							I = I + w * +(D + -8 | 0);
							D = o
						}
						if ((J | 0) == 35) {
							c[Q >> 2] = 0;
							break
						}
						c[Ia >> 2] = 0;
						y = 5.699999746866524e-04 / +(1 << ($ ? 0 : R) | 0);
						y = y * y;
						v = 1.0 - u;
						o = 0;
						z = 0.0;
						A = 0;
						while (1) {
							if ((A | 0) == 21) break;
							g[Aa >> 2] = 0.0;
							n = c[24640 + (A << 2) >> 2] | 0;
							f = A + 1 | 0;
							d = c[24640 + (f << 2) >> 2] | 0;
							w = 0.0;
							x = n;
							while (1) {
								if ((x | 0) >= (d | 0)) break;
								Oa = +g[Ka + (x << 3) >> 2];
								D = 480 - x | 0;
								Na = +g[Ka + (D << 3) >> 2];
								u = +g[Ka + (x << 3) + 4 >> 2];
								C = +g[Ka + (D << 3) + 4 >> 2];
								C = w + (Oa * Oa + Na * Na + u * u + C * C);
								g[Aa >> 2] = C;
								w = C;
								x = x + 1 | 0
							}
							c[Ia >> 2] = c[(+g[Ia >> 2] > w ? Ia : Aa) >> 2];
							x = a + 6560 + (A << 2) | 0;
							C = v * +g[x >> 2];
							w = C > w ? C : w;
							g[x >> 2] = w;
							C = +g[Aa >> 2];
							w = C > w ? C : w;
							g[Aa >> 2] = w;
							z = z * .05000000074505806;
							z = z > w ? z : w;
							if (!(w > z * .1)) {
								x = o;
								A = f;
								o = x;
								continue
							}
							if (!(w * 1.0e9 > +g[Ia >> 2])) {
								x = o;
								A = f;
								o = x;
								continue
							}
							if (!(w > y * +(d - n | 0))) {
								x = o;
								A = f;
								o = x;
								continue
							}
							o = A;
							A = f
						}
						J = (c[xa >> 2] | 0) < 3 ? 20 : o;
						Oa = +fd(B) * 20.0;
						B = +g[aa >> 2] + -.029999999329447746;
						B = B > Oa ? B : Oa;
						g[aa >> 2] = B;
						C = +g[ba >> 2] * (1.0 - t);
						g[ba >> 2] = Oa < B + -30.0 ? C + t : C;
						f = 0;
						while (1) {
							if ((f | 0) == 8) break;
							x = f << 4;
							n = 0;
							d = 0;
							while (1) {
								if ((n | 0) == 16) break;
								D = (g[k >> 2] = (c[k >> 2] = d, +g[k >> 2]) + +g[24728 + (x + n << 2) >> 2] * +g[Ha + (n << 2) >> 2], c[k >> 2] | 0);
								n = n + 1 | 0;
								d = D
							}
							c[za + (f << 2) >> 2] = d;
							f = f + 1 | 0
						}
						z = (c[k >> 2] = F, +g[k >> 2]) / 18.0;
						C = (c[k >> 2] = E, +g[k >> 2]) / 18.0;
						g[K >> 2] = C + (1.0 - C) * ((c[xa >> 2] | 0) < 10 ? .5 : H / 18.0);
						Oa = G / 9.0;
						B = +g[ca >> 2] * .800000011920929;
						B = Oa > B ? Oa : B;
						g[ca >> 2] = B;
						f = a + 8512 + (L * 28 | 0) + 8 | 0;
						g[f >> 2] = I * .015625;
						c[_ >> 2] = ((c[_ >> 2] | 0) + 1 | 0) % 8 | 0;
						c[xa >> 2] = (c[xa >> 2] | 0) + 1;
						x = a + 8512 + (L * 28 | 0) + 4 | 0;
						g[x >> 2] = B;
						n = 0;
						while (1) {
							if ((n | 0) == 4) break;
							g[Da + (n << 2) >> 2] = (+g[za + (n << 2) >> 2] + +g[a + 6644 + (n + 24 << 2) >> 2]) * -.12298999726772308 + (+g[a + 6644 + (n << 2) >> 2] + +g[a + 6644 + (n + 16 << 2) >> 2]) * .49195000529289246 + +g[a + 6644 + (n + 8 << 2) >> 2] * .6969299912452698 - +g[a + 6772 + (n << 2) >> 2] * 1.4349000453948975;
							n = n + 1 | 0
						}
						w = 1.0 - r;
						n = 0;
						while (1) {
							if ((n | 0) == 4) {
								n = 0;
								break
							}
							F = a + 6772 + (n << 2) | 0;
							g[F >> 2] = w * +g[F >> 2] + r * +g[za + (n << 2) >> 2];
							n = n + 1 | 0
						}
						while (1) {
							if ((n | 0) == 4) {
								n = 0;
								break
							}
							g[Da + (n + 4 << 2) >> 2] = (+g[za + (n << 2) >> 2] - +g[a + 6644 + (n + 24 << 2) >> 2]) * .6324599981307983 + (+g[a + 6644 + (n << 2) >> 2] - +g[a + 6644 + (n + 16 << 2) >> 2]) * .31622999906539917;
							n = n + 1 | 0
						}
						while (1) {
							if ((n | 0) == 3) break;
							F = n + 8 | 0;
							g[Da + (F << 2) >> 2] = (+g[za + (n << 2) >> 2] + +g[a + 6644 + (n + 24 << 2) >> 2]) * .5345199704170227 - (+g[a + 6644 + (n << 2) >> 2] + +g[a + 6644 + (n + 16 << 2) >> 2]) * .26725998520851135 - +g[a + 6644 + (F << 2) >> 2] * .5345199704170227;
							n = n + 1 | 0
						}
						b: do
							if ((c[xa >> 2] | 0) > 5) {
								n = 0;
								while (1) {
									if ((n | 0) == 9) {
										n = 0;
										break b
									}
									F = a + 6804 + (n << 2) | 0;
									B = +g[Da + (n << 2) >> 2];
									g[F >> 2] = w * +g[F >> 2] + r * B * B;
									n = n + 1 | 0
								}
							} else n = 0;
						while (0);
						while (1) {
							if ((n | 0) == 8) {
								n = 0;
								break
							}
							F = a + 6644 + (n + 16 << 2) | 0;
							c[a + 6644 + (n + 24 << 2) >> 2] = c[F >> 2];
							E = a + 6644 + (n + 8 << 2) | 0;
							c[F >> 2] = c[E >> 2];
							F = a + 6644 + (n << 2) | 0;
							c[E >> 2] = c[F >> 2];
							c[F >> 2] = c[za + (n << 2) >> 2];
							n = n + 1 | 0
						}
						while (1) {
							if ((n | 0) == 9) break;
							g[Da + (n + 11 << 2) >> 2] = +O(+(+g[a + 6804 + (n << 2) >> 2]));
							n = n + 1 | 0
						}
						c[da >> 2] = c[x >> 2];
						c[ea >> 2] = c[K >> 2];
						g[fa >> 2] = z;
						c[ga >> 2] = c[f >> 2];
						c[ha >> 2] = c[ba >> 2];
						f = 26044;
						x = 0;
						while (1) {
							if ((x | 0) == 15) {
								f = 27604;
								x = 0;
								break
							}
							n = f;
							d = 0;
							o = c[f >> 2] | 0;
							while (1) {
								n = n + 4 | 0;
								if ((d | 0) == 25) break;
								F = (g[k >> 2] = (c[k >> 2] = o, +g[k >> 2]) + +g[Da + (d << 2) >> 2] * +g[n >> 2], c[k >> 2] | 0);
								d = d + 1 | 0;
								o = F
							}
							f = f + 104 | 0;
							t = (c[k >> 2] = o, +g[k >> 2]);
							if (t < 8.0)
								if (t > -8.0)
									if (t != t | 0.0 != 0.0) n = 0;
									else {
										n = t < 0.0;
										B = n ? -t : t;
										F = ~~+M(+(B * 25.0 + .5));
										B = B - +(F | 0) * .03999999910593033;
										Oa = +g[25240 + (F << 2) >> 2];
										n = (g[k >> 2] = (n ? -1.0 : 1.0) * (Oa + B * (1.0 - Oa * Oa) * (1.0 - Oa * B)), c[k >> 2] | 0)
									}
							else n = -1082130432;
							else n = 1065353216;
							c[Fa + (x << 2) >> 2] = n;
							x = x + 1 | 0
						}
						while (1) {
							if ((x | 0) == 2) break;
							n = f;
							d = 0;
							o = c[f >> 2] | 0;
							while (1) {
								n = n + 4 | 0;
								if ((d | 0) == 15) break;
								F = (g[k >> 2] = (c[k >> 2] = o, +g[k >> 2]) + +g[Fa + (d << 2) >> 2] * +g[n >> 2], c[k >> 2] | 0);
								d = d + 1 | 0;
								o = F
							}
							f = f + 64 | 0;
							t = (c[k >> 2] = o, +g[k >> 2]);
							if (t < 8.0)
								if (t > -8.0)
									if (t != t | 0.0 != 0.0) n = 0;
									else {
										n = t < 0.0;
										B = n ? -t : t;
										F = ~~+M(+(B * 25.0 + .5));
										B = B - +(F | 0) * .03999999910593033;
										Oa = +g[25240 + (F << 2) >> 2];
										n = (g[k >> 2] = (n ? -1.0 : 1.0) * (Oa + B * (1.0 - Oa * Oa) * (1.0 - Oa * B)), c[k >> 2] | 0)
									}
							else n = -1082130432;
							else n = 1065353216;
							c[Ea + (x << 2) >> 2] = n;
							x = x + 1 | 0
						}
						v = (+g[Ea >> 2] + 1.0) * .5;
						v = v * 1.2100000381469727 * v + .009999999776482582 - +P(+v, 10.0) * .23000000417232513;
						z = +g[ia >> 2] * .5 + .5;
						g[ia >> 2] = z;
						v = z * v + (1.0 - z) * .5;
						g[Ea >> 2] = v;
						z = z * 4.999999873689376e-05;
						if (!(v > .949999988079071))
							if (v < .05000000074505806) r = .05000000074505806;
							else r = v;
						else r = .949999988079071;
						u = +g[ya >> 2];
						if (!(u > .949999988079071))
							if (u < .05000000074505806) t = .05000000074505806;
							else t = u;
						else t = .949999988079071;
						Oa = 1.0 - u;
						y = 1.0 - z;
						w = +N(+(r - t)) * .05000000074505806 / (r * (1.0 - t) + t * (1.0 - r)) + .009999999776482582;
						B = (u * y + Oa * z) * +P(+v, +w);
						B = B / ((Oa * y + u * z) * +P(+(1.0 - v), +w) + B);
						g[ya >> 2] = B;
						g[a + 8512 + (L * 28 | 0) + 20 >> 2] = B;
						B = +g[Ea >> 2];
						r = +P(+(1.0 - B), +w);
						w = +P(+B, +w);
						if ((c[xa >> 2] | 0) == 1) {
							g[ja >> 2] = .5;
							g[ka >> 2] = .5;
							v = .5;
							u = .5
						} else {
							v = +g[ja >> 2];
							u = +g[ka >> 2]
						}
						t = v + +g[la >> 2];
						v = u + +g[ma >> 2];
						g[ja >> 2] = t * y * r;
						g[ka >> 2] = v * y * w;
						n = 1;
						while (1) {
							if ((n | 0) == 199) break;
							F = n + 1 | 0;
							g[a + 6884 + (n << 2) >> 2] = +g[a + 6884 + (F << 2) >> 2] * r;
							g[a + 7684 + (n << 2) >> 2] = +g[a + 7684 + (F << 2) >> 2] * w;
							n = F
						}
						g[na >> 2] = v * z * r;
						g[oa >> 2] = t * z * w;
						n = 507307272;
						f = 0;
						while (1) {
							if ((f | 0) == 200) break;
							n = (g[k >> 2] = (c[k >> 2] = n, +g[k >> 2]) + (+g[a + 6884 + (f << 2) >> 2] + +g[a + 7684 + (f << 2) >> 2]), c[k >> 2] | 0);
							f = f + 1 | 0
						}
						t = 1.0 / (c[k >> 2] = n, +g[k >> 2]);
						n = 0;
						while (1) {
							if ((n | 0) == 200) break;
							F = a + 6884 + (n << 2) | 0;
							g[F >> 2] = +g[F >> 2] * t;
							F = a + 7684 + (n << 2) | 0;
							g[F >> 2] = +g[F >> 2] * t;
							n = n + 1 | 0
						}
						if (+g[ia >> 2] > .75) {
							r = +g[ya >> 2];
							if (r > .9) {
								F = (c[pa >> 2] | 0) + 1 | 0;
								c[pa >> 2] = F;
								c[pa >> 2] = (F | 0) < 500 ? F : 500;
								Oa = +g[qa >> 2];
								B = +g[Ea >> 2] - Oa;
								g[qa >> 2] = Oa + 1.0 / +(F | 0) * (B < -.20000000298023224 ? -.20000000298023224 : B)
							}
							if (r < .1) {
								F = (c[ra >> 2] | 0) + 1 | 0;
								c[ra >> 2] = F;
								c[ra >> 2] = (F | 0) < 500 ? F : 500;
								Oa = +g[sa >> 2];
								B = +g[Ea >> 2] - Oa;
								g[sa >> 2] = Oa + 1.0 / +(F | 0) * (B > .20000000298023224 ? .20000000298023224 : B)
							}
						} else {
							if (!(c[pa >> 2] | 0)) g[qa >> 2] = .8999999761581421;
							if (!(c[ra >> 2] | 0)) g[sa >> 2] = .10000000149011612
						}
						n = +g[ya >> 2] > .5 & 1;
						if ((c[ta >> 2] | 0) != (n | 0)) c[wa >> 2] = 0;
						c[ta >> 2] = n;
						c[a + 8512 + (L * 28 | 0) + 24 >> 2] = J;
						g[a + 8512 + (L * 28 | 0) + 12 >> 2] = C;
						c[Q >> 2] = 1
					}
				while (0);
				if ((T | 0) > 480) {
					S = S + 480 | 0;
					T = T + -480 | 0
				} else break
			}
			c[va >> 2] = ua - h
		}
		c[q >> 2] = 0;
		n = a + 8504 | 0;
		d = c[n >> 2] | 0;
		o = c[s >> 2] | 0;
		f = o - d | 0;
		f = (f | 0) < 0 ? f + 200 | 0 : f;
		if (!((h | 0) <= 480 | (o | 0) == (d | 0))) {
			d = d + 1 | 0;
			d = (d | 0) == 200 ? 0 : d
		}
		ua = (d | 0) == (o | 0);
		s = o + -1 | 0;
		d = a + 8512 + ((((ua ? s : d) | 0) < 0 ? 199 : ua ? s : d) * 28 | 0) | 0;
		c[q >> 2] = c[d >> 2];
		c[q + 4 >> 2] = c[d + 4 >> 2];
		c[q + 8 >> 2] = c[d + 8 >> 2];
		c[q + 12 >> 2] = c[d + 12 >> 2];
		c[q + 16 >> 2] = c[d + 16 >> 2];
		c[q + 20 >> 2] = c[d + 20 >> 2];
		c[q + 24 >> 2] = c[d + 24 >> 2];
		d = a + 8508 | 0;
		s = (c[d >> 2] | 0) + ((h | 0) / 120 | 0) | 0;
		c[d >> 2] = s;
		while (1) {
			if ((s | 0) <= 3) break;
			ua = s + -4 | 0;
			c[d >> 2] = ua;
			c[n >> 2] = (c[n >> 2] | 0) + 1;
			s = ua
		}
		s = c[n >> 2] | 0;
		if ((s | 0) > 199) c[n >> 2] = s + -200;
		s = 200 - ((f | 0) > 10 ? f + -10 | 0 : 0) | 0;
		o = (s | 0) > 0;
		r = 0.0;
		d = 0;
		while (1) {
			if ((d | 0) >= (s | 0)) break;
			r = r + +g[a + 7684 + (d << 2) >> 2];
			d = d + 1 | 0
		}
		s = o ? s : 0;
		while (1) {
			if ((s | 0) >= 200) break;
			C = r + +g[a + 6884 + (s << 2) >> 2];
			s = s + 1 | 0;
			r = C
		}
		g[q + 20 >> 2] = r * +g[a + 8488 >> 2] + (1.0 - r) * +g[a + 8484 >> 2];
		i = Ma;
		return
	}

	function Pc(a, b) {
		a = +a;
		b = +b;
		var c = 0.0,
			d = 0.0,
			e = 0.0,
			f = 0;
		f = +N(+b) + +N(+a) < 9.999999717180685e-10;
		e = f ? b * 999999995904.0 : b;
		b = f ? a * 999999995904.0 : a;
		c = e * e;
		d = b * b;
		if (c < d) {
			a = (d + c * .6784840226173401) * (d + c * .0859554186463356);
			if (a != 0.0) {
				b = -(e * b * (d + c * .43157973885536194)) / a + (b < 0.0 ? -1.5707963705062866 : 1.5707963705062866);
				return +b
			} else {
				b = b < 0.0 ? -1.5707963705062866 : 1.5707963705062866;
				return +b
			}
		} else {
			a = (c + d * .6784840226173401) * (c + d * .0859554186463356);
			if (a != 0.0) {
				e = e * b;
				b = e * (c + d * .43157973885536194) / a + (b < 0.0 ? -1.5707963705062866 : 1.5707963705062866) - (e < 0.0 ? -1.5707963705062866 : 1.5707963705062866);
				return +b
			} else {
				b = (b < 0.0 ? -1.5707963705062866 : 1.5707963705062866) - (e * b < 0.0 ? -1.5707963705062866 : 1.5707963705062866);
				return +b
			}
		}
		return 0.0
	}

	function Qc(b, d, e, f, h) {
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
		w = ad(96) | 0;
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
		j = ad(k) | 0;
		if ((j | 0) != 0 ? (c[j + -4 >> 2] & 3 | 0) != 0 : 0) id(j | 0, 0, k | 0) | 0;
		u = w + 60 | 0;
		c[u >> 2] = j;
		k = m ? 0 : l;
		j = ad(k) | 0;
		if ((j | 0) != 0 ? (c[j + -4 >> 2] & 3 | 0) != 0 : 0) id(j | 0, 0, k | 0) | 0;
		r = w + 68 | 0;
		c[r >> 2] = j;
		k = m ? 0 : l;
		j = ad(k) | 0;
		if ((j | 0) != 0 ? (c[j + -4 >> 2] & 3 | 0) != 0 : 0) id(j | 0, 0, k | 0) | 0;
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
		if ((c[n >> 2] | 0) != (f | 0) ? (c[n >> 2] = f, (c[w + 52 >> 2] | 0) != 0) : 0) Uc(w) | 0;
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
			if (c[w + 52 >> 2] | 0) Uc(w) | 0
		}
		j = Uc(w) | 0;
		if (!j) c[w + 52 >> 2] = 1;
		else {
			bd(c[v >> 2] | 0);
			bd(c[w + 76 >> 2] | 0);
			bd(c[u >> 2] | 0);
			bd(c[r >> 2] | 0);
			bd(c[l >> 2] | 0);
			bd(w);
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

	function Rc(a) {
		a = a | 0;
		bd(c[a + 72 >> 2] | 0);
		bd(c[a + 76 >> 2] | 0);
		bd(c[a + 60 >> 2] | 0);
		bd(c[a + 68 >> 2] | 0);
		bd(c[a + 64 >> 2] | 0);
		bd(a);
		return
	}

	function Sc(a, b, d, e, f, h) {
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
			Vc(a, b, p, f, q);
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
				Vc(a, b, w, f, x);
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

	function Tc(a, b, d, e, f) {
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
			if (o) Sc(a, p, 0, d, e + (p << 2) | 0, f);
			else Sc(a, p, b + (p << 2) | 0, d, e + (p << 2) | 0, f);
			i = c[n >> 2] | 0;
			p = p + 1 | 0
		}
		c[j >> 2] = k;
		c[l >> 2] = m;
		return (c[a + 84 >> 2] | 0) == 1 | 0
	}

	function Uc(a) {
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
		k = c[27732 + (j * 20 | 0) + 4 >> 2] | 0;
		o = a + 48 | 0;
		c[o >> 2] = k;
		i = c[27732 + (j * 20 | 0) >> 2] | 0;
		c[q >> 2] = i;
		if (h >>> 0 > e >>> 0) {
			g[a + 44 >> 2] = +g[27732 + (j * 20 | 0) + 8 >> 2] * +(e >>> 0) / +(h >>> 0);
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
		} else c[a + 44 >> 2] = c[27732 + (j * 20 | 0) + 12 >> 2];
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
					i = cd(c[j >> 2] | 0, f << 2) | 0;
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
							l = +Xc(+g[f >> 2], +(k | 0) / +(i >>> 0) - +(h >>> 1 >>> 0), h, c[27732 + ((c[d >> 2] | 0) * 20 | 0) + 16 >> 2] | 0);
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
								t = +Xc(+g[f >> 2], +(j - ((k | 0) / 2 | 0) + 1 | 0) - l / +((c[b >> 2] | 0) >>> 0), k, c[27732 + ((c[d >> 2] | 0) * 20 | 0) + 16 >> 2] | 0);
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
					f = cd(c[e >> 2] | 0, (_(f, b) | 0) << 2) | 0;
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

	function Vc(a, b, d, e, f) {
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
		g = Ba[c[a + 84 >> 2] & 7](a, b, i + (j << 2) | 0, d, e, f) | 0;
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

	function Wc(a, b, d, e, f, h) {
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

	function Xc(a, b, d, e) {
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

	function Yc(a, b, d, e, f, h) {
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

	function Zc(a, b, d, e, f, h) {
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

	function _c(a, b, d, e, f, h) {
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

	function $c(a, b, d, e, f, h) {
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

	function ad(a) {
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
				k = c[7007] | 0;
				j = k >>> a;
				if (j & 3) {
					e = (j & 1 ^ 1) + a | 0;
					b = e << 1;
					d = 28068 + (b << 2) | 0;
					b = 28068 + (b + 2 << 2) | 0;
					f = c[b >> 2] | 0;
					g = f + 8 | 0;
					h = c[g >> 2] | 0;
					do
						if ((d | 0) == (h | 0)) c[7007] = k & ~(1 << e);
						else {
							if (h >>> 0 >= (c[7011] | 0) >>> 0 ? (l = h + 12 | 0, (c[l >> 2] | 0) == (f | 0)) : 0) {
								c[l >> 2] = d;
								c[b >> 2] = h;
								break
							}
							xa()
						}
					while (0);
					w = e << 3;
					c[f + 4 >> 2] = w | 3;
					w = f + (w | 4) | 0;
					c[w >> 2] = c[w >> 2] | 1;
					break
				}
				b = c[7009] | 0;
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
						h = 28068 + (f << 2) | 0;
						f = 28068 + (f + 2 << 2) | 0;
						d = c[f >> 2] | 0;
						g = d + 8 | 0;
						e = c[g >> 2] | 0;
						do
							if ((h | 0) == (e | 0)) {
								c[7007] = k & ~(1 << i);
								n = b
							} else {
								if (e >>> 0 >= (c[7011] | 0) >>> 0 ? (m = e + 12 | 0, (c[m >> 2] | 0) == (d | 0)) : 0) {
									c[m >> 2] = h;
									c[f >> 2] = e;
									n = c[7009] | 0;
									break
								}
								xa()
							}
						while (0);
						w = i << 3;
						b = w - q | 0;
						c[d + 4 >> 2] = q | 3;
						j = d + q | 0;
						c[d + (q | 4) >> 2] = b | 1;
						c[d + w >> 2] = b;
						if (n) {
							d = c[7012] | 0;
							e = n >>> 3;
							h = e << 1;
							i = 28068 + (h << 2) | 0;
							f = c[7007] | 0;
							e = 1 << e;
							if (f & e) {
								f = 28068 + (h + 2 << 2) | 0;
								h = c[f >> 2] | 0;
								if (h >>> 0 < (c[7011] | 0) >>> 0) xa();
								else {
									o = f;
									p = h
								}
							} else {
								c[7007] = f | e;
								o = 28068 + (h + 2 << 2) | 0;
								p = i
							}
							c[o >> 2] = d;
							c[p + 12 >> 2] = d;
							c[d + 8 >> 2] = p;
							c[d + 12 >> 2] = i
						}
						c[7009] = b;
						c[7012] = j;
						break
					}
					a = c[7008] | 0;
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
						k = c[28332 + ((p | s | w | h | k) + (b >>> k) << 2) >> 2] | 0;
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
						a = c[7011] | 0;
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
									if (h >>> 0 < a >>> 0) xa();
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
									xa()
								}
							while (0);
							do
								if (j) {
									h = c[k + 28 >> 2] | 0;
									g = 28332 + (h << 2) | 0;
									if ((k | 0) == (c[g >> 2] | 0)) {
										c[g >> 2] = r;
										if (!r) {
											c[7008] = c[7008] & ~(1 << h);
											break
										}
									} else {
										if (j >>> 0 < (c[7011] | 0) >>> 0) xa();
										h = j + 16 | 0;
										if ((c[h >> 2] | 0) == (k | 0)) c[h >> 2] = r;
										else c[j + 20 >> 2] = r;
										if (!r) break
									}
									g = c[7011] | 0;
									if (r >>> 0 < g >>> 0) xa();
									c[r + 24 >> 2] = j;
									h = c[k + 16 >> 2] | 0;
									do
										if (h)
											if (h >>> 0 < g >>> 0) xa();
											else {
												c[r + 16 >> 2] = h;
												c[h + 24 >> 2] = r;
												break
											}
									while (0);
									h = c[k + 20 >> 2] | 0;
									if (h)
										if (h >>> 0 < (c[7011] | 0) >>> 0) xa();
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
								e = c[7009] | 0;
								if (e) {
									d = c[7012] | 0;
									f = e >>> 3;
									h = f << 1;
									i = 28068 + (h << 2) | 0;
									g = c[7007] | 0;
									f = 1 << f;
									if (g & f) {
										h = 28068 + (h + 2 << 2) | 0;
										g = c[h >> 2] | 0;
										if (g >>> 0 < (c[7011] | 0) >>> 0) xa();
										else {
											t = h;
											v = g
										}
									} else {
										c[7007] = g | f;
										t = 28068 + (h + 2 << 2) | 0;
										v = i
									}
									c[t >> 2] = d;
									c[v + 12 >> 2] = d;
									c[d + 8 >> 2] = v;
									c[d + 12 >> 2] = i
								}
								c[7009] = b;
								c[7012] = u
							}
							g = k + 8 | 0;
							break
						}
						xa()
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
			b = c[7008] | 0;
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
				a = c[28332 + (k << 2) >> 2] | 0;
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
						i = c[28332 + ((r | t | u | v | i) + (a >>> i) << 2) >> 2] | 0;
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
				if ((o | 0) != 0 ? p >>> 0 < ((c[7009] | 0) - l | 0) >>> 0 : 0) {
					a = c[7011] | 0;
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
								if (h >>> 0 < a >>> 0) xa();
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
								xa()
							}
						while (0);
						do
							if (j) {
								i = c[o + 28 >> 2] | 0;
								h = 28332 + (i << 2) | 0;
								if ((o | 0) == (c[h >> 2] | 0)) {
									c[h >> 2] = w;
									if (!w) {
										c[7008] = c[7008] & ~(1 << i);
										break
									}
								} else {
									if (j >>> 0 < (c[7011] | 0) >>> 0) xa();
									h = j + 16 | 0;
									if ((c[h >> 2] | 0) == (o | 0)) c[h >> 2] = w;
									else c[j + 20 >> 2] = w;
									if (!w) break
								}
								i = c[7011] | 0;
								if (w >>> 0 < i >>> 0) xa();
								c[w + 24 >> 2] = j;
								h = c[o + 16 >> 2] | 0;
								do
									if (h)
										if (h >>> 0 < i >>> 0) xa();
										else {
											c[w + 16 >> 2] = h;
											c[h + 24 >> 2] = w;
											break
										}
								while (0);
								h = c[o + 20 >> 2] | 0;
								if (h)
									if (h >>> 0 < (c[7011] | 0) >>> 0) xa();
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
									e = 28068 + (g << 2) | 0;
									f = c[7007] | 0;
									h = 1 << i;
									if (f & h) {
										h = 28068 + (g + 2 << 2) | 0;
										g = c[h >> 2] | 0;
										if (g >>> 0 < (c[7011] | 0) >>> 0) xa();
										else {
											y = h;
											z = g
										}
									} else {
										c[7007] = f | h;
										y = 28068 + (g + 2 << 2) | 0;
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
								h = 28332 + (i << 2) | 0;
								c[o + (l + 28) >> 2] = i;
								c[o + (l + 20) >> 2] = 0;
								c[o + (l + 16) >> 2] = 0;
								g = c[7008] | 0;
								f = 1 << i;
								if (!(g & f)) {
									c[7008] = g | f;
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
										if (f >>> 0 < (c[7011] | 0) >>> 0) xa();
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
								w = c[7011] | 0;
								if (b >>> 0 >= w >>> 0 & A >>> 0 >= w >>> 0) {
									c[b + 12 >> 2] = C;
									c[d >> 2] = C;
									c[o + (l + 8) >> 2] = b;
									c[o + (l + 12) >> 2] = A;
									c[o + (l + 24) >> 2] = 0;
									break
								} else xa()
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
					xa()
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
				a = c[7009] | 0;
				if (a >>> 0 >= A >>> 0) {
					b = a - A | 0;
					d = c[7012] | 0;
					if (b >>> 0 > 15) {
						c[7012] = d + A;
						c[7009] = b;
						c[d + (A + 4) >> 2] = b | 1;
						c[d + a >> 2] = b;
						c[d + 4 >> 2] = A | 3
					} else {
						c[7009] = 0;
						c[7012] = 0;
						c[d + 4 >> 2] = a | 3;
						w = d + (a + 4) | 0;
						c[w >> 2] = c[w >> 2] | 1
					}
					g = d + 8 | 0;
					break
				}
				j = c[7010] | 0;
				if (j >>> 0 > A >>> 0) {
					w = j - A | 0;
					c[7010] = w;
					g = c[7013] | 0;
					c[7013] = g + A;
					c[g + (A + 4) >> 2] = w | 1;
					c[g + 4 >> 2] = A | 3;
					g = g + 8 | 0;
					break
				}
				do
					if (!(c[7125] | 0)) {
						j = za(30) | 0;
						if (!(j + -1 & j)) {
							c[7127] = j;
							c[7126] = j;
							c[7128] = -1;
							c[7129] = -1;
							c[7130] = 0;
							c[7118] = 0;
							c[7125] = (ra(0) | 0) & -16 ^ 1431655768;
							break
						} else xa()
					}
				while (0);
				k = A + 48 | 0;
				h = c[7127] | 0;
				f = A + 47 | 0;
				i = h + f | 0;
				h = 0 - h | 0;
				l = i & h;
				if (l >>> 0 > A >>> 0) {
					a = c[7117] | 0;
					if ((a | 0) != 0 ? (v = c[7115] | 0, w = v + l | 0, w >>> 0 <= v >>> 0 | w >>> 0 > a >>> 0) : 0) {
						g = 0;
						break
					}
					e: do
						if (!(c[7118] & 4)) {
							j = c[7013] | 0;
							f: do
								if (j) {
									g = 28476;
									while (1) {
										a = c[g >> 2] | 0;
										if (a >>> 0 <= j >>> 0 ? (x = g + 4 | 0, (a + (c[x >> 2] | 0) | 0) >>> 0 > j >>> 0) : 0) break;
										a = c[g + 8 >> 2] | 0;
										if (!a) {
											S = 174;
											break f
										} else g = a
									}
									a = i - (c[7010] | 0) & h;
									if (a >>> 0 < 2147483647) {
										i = qa(a | 0) | 0;
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
									h = qa(0) | 0;
									if ((h | 0) != (-1 | 0)) {
										a = h;
										j = c[7126] | 0;
										i = j + -1 | 0;
										if (!(i & a)) a = l;
										else a = l - a + (i + a & 0 - j) | 0;
										j = c[7115] | 0;
										i = j + a | 0;
										if (a >>> 0 > A >>> 0 & a >>> 0 < 2147483647) {
											w = c[7117] | 0;
											if ((w | 0) != 0 ? i >>> 0 <= j >>> 0 | i >>> 0 > w >>> 0 : 0) {
												j = 0;
												break
											}
											i = qa(a | 0) | 0;
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
										if (k >>> 0 > a >>> 0 & (a >>> 0 < 2147483647 & (i | 0) != (-1 | 0)) ? (B = c[7127] | 0, B = f - a + B & 0 - B, B >>> 0 < 2147483647) : 0)
											if ((qa(B | 0) | 0) == (-1 | 0)) {
												qa(h | 0) | 0;
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
							c[7118] = c[7118] | 4;
							S = 191
						} else {
							j = 0;
							S = 191
						}
					while (0);
					if ((((S | 0) == 191 ? l >>> 0 < 2147483647 : 0) ? (D = qa(l | 0) | 0, E = qa(0) | 0, D >>> 0 < E >>> 0 & ((D | 0) != (-1 | 0) & (E | 0) != (-1 | 0))) : 0) ? (F = E - D | 0, G = F >>> 0 > (A + 40 | 0) >>> 0, G) : 0) {
						z = D;
						q = G ? F : j;
						S = 194
					}
					if ((S | 0) == 194) {
						i = (c[7115] | 0) + q | 0;
						c[7115] = i;
						if (i >>> 0 > (c[7116] | 0) >>> 0) c[7116] = i;
						p = c[7013] | 0;
						h: do
							if (p) {
								g = 28476;
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
									w = (c[7010] | 0) + q | 0;
									v = p + 8 | 0;
									v = (v & 7 | 0) == 0 ? 0 : 0 - v & 7;
									u = w - v | 0;
									c[7013] = p + v;
									c[7010] = u;
									c[p + (v + 4) >> 2] = u | 1;
									c[p + (w + 4) >> 2] = 40;
									c[7014] = c[7129];
									break
								}
								j = c[7011] | 0;
								if (z >>> 0 < j >>> 0) {
									c[7011] = z;
									j = z
								}
								h = z + q | 0;
								i = 28476;
								while (1) {
									if ((c[i >> 2] | 0) == (h | 0)) {
										S = 212;
										break
									}
									i = c[i + 8 >> 2] | 0;
									if (!i) {
										i = 28476;
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
												if ((i | 0) == (c[7012] | 0)) {
													w = (c[7009] | 0) + a | 0;
													c[7009] = w;
													c[7012] = m;
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
																	if (g >>> 0 < j >>> 0) xa();
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
																	xa()
																}
															while (0);
															if (!d) break;
															j = c[z + (q + 28 + l) >> 2] | 0;
															h = 28332 + (j << 2) | 0;
															do
																if ((i | 0) != (c[h >> 2] | 0)) {
																	if (d >>> 0 < (c[7011] | 0) >>> 0) xa();
																	h = d + 16 | 0;
																	if ((c[h >> 2] | 0) == (i | 0)) c[h >> 2] = O;
																	else c[d + 20 >> 2] = O;
																	if (!O) break j
																} else {
																	c[h >> 2] = O;
																	if (O) break;
																	c[7008] = c[7008] & ~(1 << j);
																	break j
																}
															while (0);
															j = c[7011] | 0;
															if (O >>> 0 < j >>> 0) xa();
															c[O + 24 >> 2] = d;
															i = l | 16;
															h = c[z + (i + q) >> 2] | 0;
															do
																if (h)
																	if (h >>> 0 < j >>> 0) xa();
																	else {
																		c[O + 16 >> 2] = h;
																		c[h + 24 >> 2] = O;
																		break
																	}
															while (0);
															i = c[z + (b + i) >> 2] | 0;
															if (!i) break;
															if (i >>> 0 < (c[7011] | 0) >>> 0) xa();
															else {
																c[O + 20 >> 2] = i;
																c[i + 24 >> 2] = O;
																break
															}
														} else {
															h = c[z + ((l | 8) + q) >> 2] | 0;
															g = c[z + (q + 12 + l) >> 2] | 0;
															f = 28068 + (e << 1 << 2) | 0;
															do
																if ((h | 0) != (f | 0)) {
																	if (h >>> 0 >= j >>> 0 ? (c[h + 12 >> 2] | 0) == (i | 0) : 0) break;
																	xa()
																}
															while (0);
															if ((g | 0) == (h | 0)) {
																c[7007] = c[7007] & ~(1 << e);
																break
															}
															do
																if ((g | 0) == (f | 0)) J = g + 8 | 0;
																else {
																	if (g >>> 0 >= j >>> 0 ? (K = g + 8 | 0, (c[K >> 2] | 0) == (i | 0)) : 0) {
																		J = K;
																		break
																	}
																	xa()
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
													e = 28068 + (g << 2) | 0;
													f = c[7007] | 0;
													h = 1 << i;
													do
														if (!(f & h)) {
															c[7007] = f | h;
															P = 28068 + (g + 2 << 2) | 0;
															Q = e
														} else {
															h = 28068 + (g + 2 << 2) | 0;
															g = c[h >> 2] | 0;
															if (g >>> 0 >= (c[7011] | 0) >>> 0) {
																P = h;
																Q = g;
																break
															}
															xa()
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
												h = 28332 + (i << 2) | 0;
												c[z + (o + 28) >> 2] = i;
												c[z + (o + 20) >> 2] = 0;
												c[z + (o + 16) >> 2] = 0;
												g = c[7008] | 0;
												f = 1 << i;
												if (!(g & f)) {
													c[7008] = g | f;
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
														if (f >>> 0 < (c[7011] | 0) >>> 0) xa();
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
												w = c[7011] | 0;
												if (b >>> 0 >= w >>> 0 & R >>> 0 >= w >>> 0) {
													c[b + 12 >> 2] = m;
													c[d >> 2] = m;
													c[z + (o + 8) >> 2] = b;
													c[z + (o + 12) >> 2] = R;
													c[z + (o + 24) >> 2] = 0;
													break
												} else xa()
											} else {
												w = (c[7010] | 0) + a | 0;
												c[7010] = w;
												c[7013] = m;
												c[z + (o + 4) >> 2] = w | 1
											}
										while (0);
										g = z + (n | 8) | 0;
										break d
									} else i = 28476;
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
								c[7013] = z + g;
								c[7010] = w;
								c[z + (g + 4) >> 2] = w | 1;
								c[z + (q + -36) >> 2] = 40;
								c[7014] = c[7129];
								g = i + 4 | 0;
								c[g >> 2] = 27;
								c[h >> 2] = c[7119];
								c[h + 4 >> 2] = c[7120];
								c[h + 8 >> 2] = c[7121];
								c[h + 12 >> 2] = c[7122];
								c[7119] = z;
								c[7120] = q;
								c[7122] = 0;
								c[7121] = h;
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
										i = 28068 + (h << 2) | 0;
										g = c[7007] | 0;
										e = 1 << f;
										if (g & e) {
											d = 28068 + (h + 2 << 2) | 0;
											b = c[d >> 2] | 0;
											if (b >>> 0 < (c[7011] | 0) >>> 0) xa();
											else {
												L = d;
												M = b
											}
										} else {
											c[7007] = g | e;
											L = 28068 + (h + 2 << 2) | 0;
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
									e = 28332 + (h << 2) | 0;
									c[p + 28 >> 2] = h;
									c[p + 20 >> 2] = 0;
									c[j >> 2] = 0;
									d = c[7008] | 0;
									b = 1 << h;
									if (!(d & b)) {
										c[7008] = d | b;
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
											if (e >>> 0 < (c[7011] | 0) >>> 0) xa();
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
									w = c[7011] | 0;
									if (b >>> 0 >= w >>> 0 & N >>> 0 >= w >>> 0) {
										c[b + 12 >> 2] = p;
										c[d >> 2] = p;
										c[p + 8 >> 2] = b;
										c[p + 12 >> 2] = N;
										c[p + 24 >> 2] = 0;
										break
									} else xa()
								}
							} else {
								w = c[7011] | 0;
								if ((w | 0) == 0 | z >>> 0 < w >>> 0) c[7011] = z;
								c[7119] = z;
								c[7120] = q;
								c[7122] = 0;
								c[7016] = c[7125];
								c[7015] = -1;
								d = 0;
								do {
									w = d << 1;
									v = 28068 + (w << 2) | 0;
									c[28068 + (w + 3 << 2) >> 2] = v;
									c[28068 + (w + 2 << 2) >> 2] = v;
									d = d + 1 | 0
								} while ((d | 0) != 32);
								w = z + 8 | 0;
								w = (w & 7 | 0) == 0 ? 0 : 0 - w & 7;
								v = q + -40 - w | 0;
								c[7013] = z + w;
								c[7010] = v;
								c[z + (w + 4) >> 2] = v | 1;
								c[z + (q + -36) >> 2] = 40;
								c[7014] = c[7129]
							}
						while (0);
						b = c[7010] | 0;
						if (b >>> 0 > A >>> 0) {
							w = b - A | 0;
							c[7010] = w;
							g = c[7013] | 0;
							c[7013] = g + A;
							c[g + (A + 4) >> 2] = w | 1;
							c[g + 4 >> 2] = A | 3;
							g = g + 8 | 0;
							break
						}
					}
					if (!(c[6996] | 0)) b = 28524;
					else b = c[(ma() | 0) + 60 >> 2] | 0;
					c[b >> 2] = 12;
					g = 0
				} else g = 0
			}
		while (0);
		return g | 0
	}

	function bd(a) {
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
				k = c[7011] | 0;
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
								if ((n | 0) == (c[7012] | 0)) {
									g = a + (v + -4) | 0;
									f = c[g >> 2] | 0;
									if ((f & 3 | 0) != 3) {
										B = n;
										g = o;
										break
									}
									c[7009] = o;
									c[g >> 2] = f & -2;
									c[a + (l + 4) >> 2] = o | 1;
									c[w >> 2] = o;
									break a
								}
								d = f >>> 3;
								if (f >>> 0 < 256) {
									e = c[a + (l + 8) >> 2] | 0;
									g = c[a + (l + 12) >> 2] | 0;
									f = 28068 + (d << 1 << 2) | 0;
									do
										if ((e | 0) != (f | 0)) {
											if (e >>> 0 >= k >>> 0 ? (c[e + 12 >> 2] | 0) == (n | 0) : 0) break;
											xa()
										}
									while (0);
									if ((g | 0) == (e | 0)) {
										c[7007] = c[7007] & ~(1 << d);
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
											xa()
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
										if (e >>> 0 < k >>> 0) xa();
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
										xa()
									}
								while (0);
								if (h) {
									f = c[a + (l + 28) >> 2] | 0;
									e = 28332 + (f << 2) | 0;
									if ((n | 0) == (c[e >> 2] | 0)) {
										c[e >> 2] = m;
										if (!m) {
											c[7008] = c[7008] & ~(1 << f);
											B = n;
											g = o;
											break
										}
									} else {
										if (h >>> 0 < (c[7011] | 0) >>> 0) xa();
										f = h + 16 | 0;
										if ((c[f >> 2] | 0) == (n | 0)) c[f >> 2] = m;
										else c[h + 20 >> 2] = m;
										if (!m) {
											B = n;
											g = o;
											break
										}
									}
									e = c[7011] | 0;
									if (m >>> 0 < e >>> 0) xa();
									c[m + 24 >> 2] = h;
									f = c[a + (l + 16) >> 2] | 0;
									do
										if (f)
											if (f >>> 0 < e >>> 0) xa();
											else {
												c[m + 16 >> 2] = f;
												c[f + 24 >> 2] = m;
												break
											}
									while (0);
									f = c[a + (l + 20) >> 2] | 0;
									if (f)
										if (f >>> 0 < (c[7011] | 0) >>> 0) xa();
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
								if ((w | 0) == (c[7013] | 0)) {
									x = (c[7010] | 0) + g | 0;
									c[7010] = x;
									c[7013] = B;
									c[B + 4 >> 2] = x | 1;
									if ((B | 0) != (c[7012] | 0)) break a;
									c[7012] = 0;
									c[7009] = 0;
									break a
								}
								if ((w | 0) == (c[7012] | 0)) {
									x = (c[7009] | 0) + g | 0;
									c[7009] = x;
									c[7012] = B;
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
												if (f >>> 0 < (c[7011] | 0) >>> 0) xa();
												else {
													c[f >> 2] = 0;
													x = g;
													break
												}
											} else {
												f = c[a + v >> 2] | 0;
												if ((f >>> 0 >= (c[7011] | 0) >>> 0 ? (t = f + 12 | 0, (c[t >> 2] | 0) == (w | 0)) : 0) ? (u = g + 8 | 0, (c[u >> 2] | 0) == (w | 0)) : 0) {
													c[t >> 2] = g;
													c[u >> 2] = f;
													x = g;
													break
												}
												xa()
											}
										while (0);
										if (b) {
											g = c[a + (v + 20) >> 2] | 0;
											f = 28332 + (g << 2) | 0;
											if ((w | 0) == (c[f >> 2] | 0)) {
												c[f >> 2] = x;
												if (!x) {
													c[7008] = c[7008] & ~(1 << g);
													break
												}
											} else {
												if (b >>> 0 < (c[7011] | 0) >>> 0) xa();
												g = b + 16 | 0;
												if ((c[g >> 2] | 0) == (w | 0)) c[g >> 2] = x;
												else c[b + 20 >> 2] = x;
												if (!x) break
											}
											g = c[7011] | 0;
											if (x >>> 0 < g >>> 0) xa();
											c[x + 24 >> 2] = b;
											f = c[a + (v + 8) >> 2] | 0;
											do
												if (f)
													if (f >>> 0 < g >>> 0) xa();
													else {
														c[x + 16 >> 2] = f;
														c[f + 24 >> 2] = x;
														break
													}
											while (0);
											d = c[a + (v + 12) >> 2] | 0;
											if (d)
												if (d >>> 0 < (c[7011] | 0) >>> 0) xa();
												else {
													c[x + 20 >> 2] = d;
													c[d + 24 >> 2] = x;
													break
												}
										}
									} else {
										e = c[a + v >> 2] | 0;
										g = c[a + (v | 4) >> 2] | 0;
										f = 28068 + (d << 1 << 2) | 0;
										do
											if ((e | 0) != (f | 0)) {
												if (e >>> 0 >= (c[7011] | 0) >>> 0 ? (c[e + 12 >> 2] | 0) == (w | 0) : 0) break;
												xa()
											}
										while (0);
										if ((g | 0) == (e | 0)) {
											c[7007] = c[7007] & ~(1 << d);
											break
										}
										do
											if ((g | 0) == (f | 0)) r = g + 8 | 0;
											else {
												if (g >>> 0 >= (c[7011] | 0) >>> 0 ? (s = g + 8 | 0, (c[s >> 2] | 0) == (w | 0)) : 0) {
													r = s;
													break
												}
												xa()
											}
										while (0);
										c[e + 12 >> 2] = g;
										c[r >> 2] = e
									}
								while (0);
								c[B + 4 >> 2] = j | 1;
								c[B + j >> 2] = j;
								if ((B | 0) == (c[7012] | 0)) {
									c[7009] = j;
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
								g = 28068 + (e << 2) | 0;
								b = c[7007] | 0;
								d = 1 << f;
								if (b & d) {
									d = 28068 + (e + 2 << 2) | 0;
									b = c[d >> 2] | 0;
									if (b >>> 0 < (c[7011] | 0) >>> 0) xa();
									else {
										y = d;
										z = b
									}
								} else {
									c[7007] = b | d;
									y = 28068 + (e + 2 << 2) | 0;
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
							d = 28332 + (f << 2) | 0;
							c[B + 28 >> 2] = f;
							c[B + 20 >> 2] = 0;
							c[B + 16 >> 2] = 0;
							b = c[7008] | 0;
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
											if (b >>> 0 < (c[7011] | 0) >>> 0) xa();
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
									x = c[7011] | 0;
									if (d >>> 0 >= x >>> 0 & A >>> 0 >= x >>> 0) {
										c[d + 12 >> 2] = B;
										c[b >> 2] = B;
										c[B + 8 >> 2] = d;
										c[B + 12 >> 2] = A;
										c[B + 24 >> 2] = 0;
										break
									} else xa()
								} else {
									c[7008] = b | e;
									c[d >> 2] = B;
									c[B + 24 >> 2] = d;
									c[B + 12 >> 2] = B;
									c[B + 8 >> 2] = B
								}
							while (0);
							x = (c[7015] | 0) + -1 | 0;
							c[7015] = x;
							if (!x) b = 28484;
							else break a;
							while (1) {
								b = c[b >> 2] | 0;
								if (!b) break;
								else b = b + 8 | 0
							}
							c[7015] = -1;
							break a
						}
					}
				while (0);
				xa()
			}
		while (0);
		return
	}

	function cd(a, b) {
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
			if (!a) d = ad(b) | 0;
			else {
				if (b >>> 0 > 4294967231) {
					if (!(c[6996] | 0)) d = 28524;
					else d = c[(ma() | 0) + 60 >> 2] | 0;
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
				l = c[7011] | 0;
				g = r & 3;
				if ((g | 0) != 1 & (a + -8 | 0) >>> 0 >= l >>> 0 & (t | 0) > -8 ? (h = m | 4, f = a + (h + -8) | 0, e = c[f >> 2] | 0, (e & 1 | 0) != 0) : 0) {
					do
						if (!g) {
							if (!(q >>> 0 < 256 | m >>> 0 < (q | 4) >>> 0) ? (m - q | 0) >>> 0 <= c[7127] << 1 >>> 0 : 0) {
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
								gd(a + (q + -8) | 0, e);
								d = a;
								break a
							}
							if ((n | 0) == (c[7013] | 0)) {
								e = (c[7010] | 0) + m | 0;
								if (e >>> 0 <= q >>> 0) break;
								d = e - q | 0;
								c[s >> 2] = r & 1 | q | 2;
								c[a + ((q | 4) + -8) >> 2] = d | 1;
								c[7013] = a + (q + -8);
								c[7010] = d;
								d = a;
								break a
							}
							if ((n | 0) == (c[7012] | 0)) {
								e = (c[7009] | 0) + m | 0;
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
								c[7009] = d;
								c[7012] = e;
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
												if (d >>> 0 < l >>> 0) xa();
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
												xa()
											}
										while (0);
										if (j) {
											e = c[a + (m + 20) >> 2] | 0;
											d = 28332 + (e << 2) | 0;
											if ((n | 0) == (c[d >> 2] | 0)) {
												c[d >> 2] = o;
												if (!o) {
													c[7008] = c[7008] & ~(1 << e);
													break
												}
											} else {
												if (j >>> 0 < (c[7011] | 0) >>> 0) xa();
												e = j + 16 | 0;
												if ((c[e >> 2] | 0) == (n | 0)) c[e >> 2] = o;
												else c[j + 20 >> 2] = o;
												if (!o) break
											}
											d = c[7011] | 0;
											if (o >>> 0 < d >>> 0) xa();
											c[o + 24 >> 2] = j;
											e = c[a + (m + 8) >> 2] | 0;
											do
												if (e)
													if (e >>> 0 < d >>> 0) xa();
													else {
														c[o + 16 >> 2] = e;
														c[e + 24 >> 2] = o;
														break
													}
											while (0);
											e = c[a + (m + 12) >> 2] | 0;
											if (!e) break;
											if (e >>> 0 < (c[7011] | 0) >>> 0) xa();
											else {
												c[o + 20 >> 2] = e;
												c[e + 24 >> 2] = o;
												break
											}
										}
									} else {
										g = c[a + m >> 2] | 0;
										e = c[a + h >> 2] | 0;
										d = 28068 + (f << 1 << 2) | 0;
										do
											if ((g | 0) != (d | 0)) {
												if (g >>> 0 >= l >>> 0 ? (c[g + 12 >> 2] | 0) == (n | 0) : 0) break;
												xa()
											}
										while (0);
										if ((e | 0) == (g | 0)) {
											c[7007] = c[7007] & ~(1 << f);
											break
										}
										do
											if ((e | 0) == (d | 0)) i = e + 8 | 0;
											else {
												if (e >>> 0 >= l >>> 0 ? (j = e + 8 | 0, (c[j >> 2] | 0) == (n | 0)) : 0) {
													i = j;
													break
												}
												xa()
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
									gd(a + (q + -8) | 0, b);
									d = a;
									break a
								}
							}
						}
					while (0);
					d = ad(b) | 0;
					if (!d) {
						d = 0;
						break
					}
					l = c[s >> 2] | 0;
					l = (l & -8) - ((l & 3 | 0) == 0 ? 8 : 4) | 0;
					nd(d | 0, a | 0, (l >>> 0 < b >>> 0 ? l : b) | 0) | 0;
					bd(a);
					break
				}
				xa()
			}
		while (0);
		return d | 0
	}

	function dd(a, b) {
		a = +a;
		b = b | 0;
		var d = 0;
		if ((b | 0) > 1023) {
			a = a * 8988465674311579538646525.0e283;
			d = b + -1023 | 0;
			if ((d | 0) > 1023) {
				d = b + -2046 | 0;
				d = (d | 0) > 1023 ? 1023 : d;
				a = a * 8988465674311579538646525.0e283
			}
		} else if ((b | 0) < -1022) {
			a = a * 2.2250738585072014e-308;
			d = b + 1022 | 0;
			if ((d | 0) < -1022) {
				d = b + 2044 | 0;
				d = (d | 0) < -1022 ? -1022 : d;
				a = a * 2.2250738585072014e-308
			}
		} else d = b;
		b = jd(d + 1023 | 0, 0, 52) | 0;
		d = C;
		c[k >> 2] = b;
		c[k + 4 >> 2] = d;
		return +(a * +h[k >> 3])
	}

	function ed(a) {
		a = +a;
		var b = 0,
			d = 0,
			e = 0,
			f = 0.0,
			g = 0.0;
		h[k >> 3] = a;
		b = c[k + 4 >> 2] | 0;
		d = b & 2147483647;
		do
			if (d >>> 0 > 1083174911) {
				b = (b | 0) > -1 | (b | 0) == -1 & (c[k >> 2] | 0) >>> 0 > 4294967295;
				if (b & d >>> 0 > 1083179007) {
					a = a * 8988465674311579538646525.0e283;
					break
				}
				if (d >>> 0 <= 2146435071)
					if (!(a <= -1075.0) | b) {
						e = 9;
						break
					} else {
						a = 0.0;
						break
					}
				else {
					a = -1.0 / a;
					break
				}
			} else if (d >>> 0 < 1016070144) a = a + 1.0;
		else e = 9;
		while (0);
		if ((e | 0) == 9) {
			g = a + 26388279066624.0;
			h[k >> 3] = g;
			b = (c[k >> 2] | 0) + 128 | 0;
			d = b << 1 & 510;
			f = +h[1416 + (d << 3) >> 3];
			a = a - (g + -26388279066624.0) - +h[1416 + ((d | 1) << 3) >> 3];
			a = +dd(f + f * a * (a * (a * (a * (a * 1.3333559164630223e-03 + .009618129842126066) + .0555041086648214) + .2402265069591) + .6931471805599453), (b & -256 | 0) / 256 | 0)
		}
		return +a
	}

	function fd(a) {
		a = +a;
		var b = 0,
			d = 0,
			e = 0,
			f = 0,
			g = 0.0,
			i = 0.0,
			j = 0.0,
			l = 0.0,
			m = 0.0;
		h[k >> 3] = a;
		d = c[k >> 2] | 0;
		b = c[k + 4 >> 2] | 0;
		e = (b | 0) < 0;
		do
			if (e | b >>> 0 < 1048576) {
				if ((d | 0) == 0 & (b & 2147483647 | 0) == 0) {
					a = -1.0 / (a * a);
					break
				}
				if (e) {
					a = (a - a) / 0.0;
					break
				} else {
					h[k >> 3] = a * 18014398509481984.0;
					b = c[k + 4 >> 2] | 0;
					e = c[k >> 2] | 0;
					d = -1077;
					f = 9;
					break
				}
			} else if (b >>> 0 <= 2146435071)
			if ((d | 0) == 0 & 0 == 0 & (b | 0) == 1072693248) a = 0.0;
			else {
				e = d;
				d = -1023;
				f = 9
			}
		while (0);
		if ((f | 0) == 9) {
			b = b + 614242 | 0;
			c[k >> 2] = e;
			c[k + 4 >> 2] = (b & 1048575) + 1072079006;
			m = +h[k >> 3] + -1.0;
			a = m * (m * .5);
			j = m / (m + 2.0);
			l = j * j;
			i = l * l;
			h[k >> 3] = m - a;
			e = c[k + 4 >> 2] | 0;
			c[k >> 2] = 0;
			c[k + 4 >> 2] = e;
			g = +h[k >> 3];
			a = j * (a + (i * (i * (i * .15313837699209373 + .22222198432149784) + .3999999999940942) + l * (i * (i * (i * .14798198605116586 + .1818357216161805) + .2857142874366239) + .6666666666666735))) + (m - g - a);
			m = g * .4342944818781689;
			i = +(d + (b >>> 20) | 0);
			l = i * .30102999566361177;
			j = l + m;
			a = j + (m + (l - j) + (a * .4342944818781689 + (i * 3.694239077158931e-13 + (g + a) * 2.5082946711645275e-11)))
		}
		return +a
	}

	function gd(a, b) {
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
					l = c[7011] | 0;
					if (o >>> 0 < l >>> 0) xa();
					if ((o | 0) == (c[7012] | 0)) {
						f = a + (b + 4) | 0;
						g = c[f >> 2] | 0;
						if ((g & 3 | 0) != 3) {
							p = 54;
							break
						}
						c[7009] = h;
						c[f >> 2] = g & -2;
						c[a + (4 - m) >> 2] = h | 1;
						c[u >> 2] = h;
						break
					}
					d = m >>> 3;
					if (m >>> 0 < 256) {
						e = c[a + (8 - m) >> 2] | 0;
						g = c[a + (12 - m) >> 2] | 0;
						f = 28068 + (d << 1 << 2) | 0;
						do
							if ((e | 0) != (f | 0)) {
								if (e >>> 0 >= l >>> 0 ? (c[e + 12 >> 2] | 0) == (o | 0) : 0) break;
								xa()
							}
						while (0);
						if ((g | 0) == (e | 0)) {
							c[7007] = c[7007] & ~(1 << d);
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
								xa()
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
							if (f >>> 0 < l >>> 0) xa();
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
							xa()
						}
					while (0);
					if (j) {
						g = c[a + (28 - m) >> 2] | 0;
						f = 28332 + (g << 2) | 0;
						if ((o | 0) == (c[f >> 2] | 0)) {
							c[f >> 2] = n;
							if (!n) {
								c[7008] = c[7008] & ~(1 << g);
								p = 54;
								break
							}
						} else {
							if (j >>> 0 < (c[7011] | 0) >>> 0) xa();
							g = j + 16 | 0;
							if ((c[g >> 2] | 0) == (o | 0)) c[g >> 2] = n;
							else c[j + 20 >> 2] = n;
							if (!n) {
								p = 54;
								break
							}
						}
						e = c[7011] | 0;
						if (n >>> 0 < e >>> 0) xa();
						c[n + 24 >> 2] = j;
						g = 16 - m | 0;
						f = c[a + g >> 2] | 0;
						do
							if (f)
								if (f >>> 0 < e >>> 0) xa();
								else {
									c[n + 16 >> 2] = f;
									c[f + 24 >> 2] = n;
									break
								}
						while (0);
						g = c[a + (g + 4) >> 2] | 0;
						if (g)
							if (g >>> 0 < (c[7011] | 0) >>> 0) xa();
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
				j = c[7011] | 0;
				if (u >>> 0 < j >>> 0) xa();
				g = a + (b + 4) | 0;
				f = c[g >> 2] | 0;
				if (!(f & 2)) {
					if ((u | 0) == (c[7013] | 0)) {
						w = (c[7010] | 0) + h | 0;
						c[7010] = w;
						c[7013] = o;
						c[o + 4 >> 2] = w | 1;
						if ((o | 0) != (c[7012] | 0)) break;
						c[7012] = 0;
						c[7009] = 0;
						break
					}
					if ((u | 0) == (c[7012] | 0)) {
						w = (c[7009] | 0) + h | 0;
						c[7009] = w;
						c[7012] = o;
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
									if (g >>> 0 < j >>> 0) xa();
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
									xa()
								}
							while (0);
							if (k) {
								h = c[a + (b + 28) >> 2] | 0;
								g = 28332 + (h << 2) | 0;
								if ((u | 0) == (c[g >> 2] | 0)) {
									c[g >> 2] = v;
									if (!v) {
										c[7008] = c[7008] & ~(1 << h);
										break
									}
								} else {
									if (k >>> 0 < (c[7011] | 0) >>> 0) xa();
									h = k + 16 | 0;
									if ((c[h >> 2] | 0) == (u | 0)) c[h >> 2] = v;
									else c[k + 20 >> 2] = v;
									if (!v) break
								}
								h = c[7011] | 0;
								if (v >>> 0 < h >>> 0) xa();
								c[v + 24 >> 2] = k;
								g = c[a + (b + 16) >> 2] | 0;
								do
									if (g)
										if (g >>> 0 < h >>> 0) xa();
										else {
											c[v + 16 >> 2] = g;
											c[g + 24 >> 2] = v;
											break
										}
								while (0);
								e = c[a + (b + 20) >> 2] | 0;
								if (e)
									if (e >>> 0 < (c[7011] | 0) >>> 0) xa();
									else {
										c[v + 20 >> 2] = e;
										c[e + 24 >> 2] = v;
										break
									}
							}
						} else {
							f = c[a + (b + 8) >> 2] | 0;
							h = c[a + (b + 12) >> 2] | 0;
							g = 28068 + (e << 1 << 2) | 0;
							do
								if ((f | 0) != (g | 0)) {
									if (f >>> 0 >= j >>> 0 ? (c[f + 12 >> 2] | 0) == (u | 0) : 0) break;
									xa()
								}
							while (0);
							if ((h | 0) == (f | 0)) {
								c[7007] = c[7007] & ~(1 << e);
								break
							}
							do
								if ((h | 0) == (g | 0)) q = h + 8 | 0;
								else {
									if (h >>> 0 >= j >>> 0 ? (r = h + 8 | 0, (c[r >> 2] | 0) == (u | 0)) : 0) {
										q = r;
										break
									}
									xa()
								}
							while (0);
							c[f + 12 >> 2] = h;
							c[q >> 2] = f
						}
					while (0);
					c[o + 4 >> 2] = i | 1;
					c[o + i >> 2] = i;
					if ((o | 0) == (c[7012] | 0)) {
						c[7009] = i;
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
					h = 28068 + (f << 2) | 0;
					d = c[7007] | 0;
					e = 1 << g;
					if (d & e) {
						e = 28068 + (f + 2 << 2) | 0;
						d = c[e >> 2] | 0;
						if (d >>> 0 < (c[7011] | 0) >>> 0) xa();
						else {
							w = e;
							x = d
						}
					} else {
						c[7007] = d | e;
						w = 28068 + (f + 2 << 2) | 0;
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
				e = 28332 + (g << 2) | 0;
				c[o + 28 >> 2] = g;
				c[o + 20 >> 2] = 0;
				c[o + 16 >> 2] = 0;
				d = c[7008] | 0;
				f = 1 << g;
				if (!(d & f)) {
					c[7008] = d | f;
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
						if (d >>> 0 < (c[7011] | 0) >>> 0) xa();
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
				w = c[7011] | 0;
				if (e >>> 0 >= w >>> 0 & y >>> 0 >= w >>> 0) {
					c[e + 12 >> 2] = o;
					c[d >> 2] = o;
					c[o + 8 >> 2] = e;
					c[o + 12 >> 2] = y;
					c[o + 24 >> 2] = 0;
					break
				} else xa()
			}
		while (0);
		return
	}

	function hd() {}

	function id(b, d, e) {
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

	function jd(a, b, c) {
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

	function kd(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		c = a + c >>> 0;
		return (C = b + d + (c >>> 0 < a >>> 0 | 0) >>> 0, c | 0) | 0
	}

	function ld(a, b, c) {
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

	function md(a, b, c) {
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

	function nd(b, d, e) {
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0;
		if ((e | 0) >= 4096) return ua(b | 0, d | 0, e | 0) | 0;
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

	function od(b, c, d) {
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
		} else nd(b, c, d) | 0;
		return b | 0
	}

	function pd(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		b = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0;
		return (C = b, a - c >>> 0 | 0) | 0
	}

	function qd(b) {
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

	function rd(a, b) {
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

	function sd(a, b, c, d) {
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
		h = pd(j ^ a, i ^ b, j, i) | 0;
		g = C;
		b = f ^ j;
		a = e ^ i;
		return pd((xd(h, g, pd(f ^ c, e ^ d, f, e) | 0, C, 0) | 0) ^ b, C ^ a, b, a) | 0
	}

	function td(a, b, d, e) {
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
		b = pd(h ^ a, g ^ b, h, g) | 0;
		a = C;
		xd(b, a, pd(l ^ d, k ^ e, l, k) | 0, C, j) | 0;
		a = pd(c[j >> 2] ^ h, c[j + 4 >> 2] ^ g, h, g) | 0;
		b = C;
		i = f;
		return (C = b, a) | 0
	}

	function ud(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		var e = 0,
			f = 0;
		e = a;
		f = c;
		a = rd(e, f) | 0;
		c = C;
		return (C = (_(b, f) | 0) + (_(d, e) | 0) + c | c & 0, a | 0 | 0) | 0
	}

	function vd(a, b, c, d) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		return xd(a, b, c, d, 0) | 0
	}

	function wd(a, b, d, e) {
		a = a | 0;
		b = b | 0;
		d = d | 0;
		e = e | 0;
		var f = 0,
			g = 0;
		g = i;
		i = i + 16 | 0;
		f = g | 0;
		xd(a, b, d, e, f) | 0;
		i = g;
		return (C = c[f + 4 >> 2] | 0, c[f >> 2] | 0) | 0
	}

	function xd(a, b, d, e, f) {
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
					a = qd(k | 0) | 0;
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
					m = m >>> ((qd(i | 0) | 0) >>> 0);
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
			b = kd(m | 0, l | 0, -1, -1) | 0;
			a = C;
			d = h;
			h = 0;
			do {
				p = d;
				d = g >>> 31 | d << 1;
				g = h | g << 1;
				p = j << 1 | p >>> 31 | 0;
				o = j >>> 31 | k << 1 | 0;
				pd(b, a, p, o) | 0;
				n = C;
				e = n >> 31 | ((n | 0) < 0 ? -1 : 0) << 1;
				h = e & 1;
				j = pd(p, o, e & m, (((n | 0) < 0 ? -1 : 0) >> 31 | ((n | 0) < 0 ? -1 : 0) << 1) & l) | 0;
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

	function yd(a, b, c, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		return Ba[a & 7](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0) | 0
	}

	function zd(a, b, c, d, e, f, g, h) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		h = h | 0;
		Ca[a & 1](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0)
	}

	function Ad(a, b, c, d, e, f) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		ba(0);
		return 0
	}

	function Bd(a, b, c, d, e, f, g) {
		a = a | 0;
		b = b | 0;
		c = c | 0;
		d = d | 0;
		e = e | 0;
		f = f | 0;
		g = g | 0;
		ba(1)
	}

	// EMSCRIPTEN_END_FUNCS
	var Ba = [Ad, Wc, Yc, Zc, _c, $c, Ad, Ad];
	var Ca = [Bd, Cc];
	return {
		_speex_resampler_destroy: Rc,
		_free: bd,
		_memset: id,
		_opus_encode_float: Ec,
		_speex_resampler_init: Qc,
		_memmove: od,
		_bitshift64Ashr: ld,
		_opus_encoder_destroy: Gc,
		_speex_resampler_process_interleaved_float: Tc,
		_malloc: ad,
		_i64Add: kd,
		_opus_encoder_create: Bc,
		_memcpy: nd,
		_bitshift64Lshr: md,
		_opus_encoder_ctl: Fc,
		_bitshift64Shl: jd,
		runPostSets: hd,
		stackAlloc: Da,
		stackSave: Ea,
		stackRestore: Fa,
		establishStackSpace: Ga,
		setThrew: Ha,
		setTempRet0: Ka,
		getTempRet0: La,
		dynCall_iiiiiii: yd,
		dynCall_viiiiiii: zd
	}
})


// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var _speex_resampler_destroy = Module["_speex_resampler_destroy"] = asm["_speex_resampler_destroy"];
var _free = Module["_free"] = asm["_free"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _opus_encode_float = Module["_opus_encode_float"] = asm["_opus_encode_float"];
var _speex_resampler_init = Module["_speex_resampler_init"] = asm["_speex_resampler_init"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _bitshift64Ashr = Module["_bitshift64Ashr"] = asm["_bitshift64Ashr"];
var _memset = Module["_memset"] = asm["_memset"];
var _opus_encoder_destroy = Module["_opus_encoder_destroy"] = asm["_opus_encoder_destroy"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _opus_encoder_create = Module["_opus_encoder_create"] = asm["_opus_encoder_create"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _speex_resampler_process_interleaved_float = Module["_speex_resampler_process_interleaved_float"] = asm["_speex_resampler_process_interleaved_float"];
var _opus_encoder_ctl = Module["_opus_encoder_ctl"] = asm["_opus_encoder_ctl"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
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
var SpeexResampler = (function() {
	function SpeexResampler(channels, in_rate, out_rate, quality) {
		if (quality === void 0) {
			quality = 5
		}
		this.handle = 0;
		this.in_ptr = 0;
		this.out_ptr = 0;
		this.in_capacity = 0;
		this.in_len_ptr = 0;
		this.out_len_ptr = 0;
		this.channels = channels;
		this.in_rate = in_rate;
		this.out_rate = out_rate;
		var err_ptr = Module._malloc(4);
		this.handle = _speex_resampler_init(channels, in_rate, out_rate, quality, err_ptr);
		if (Module.getValue(err_ptr, "i32") != 0) throw "speex_resampler_init failed: ret=" + Module.getValue(err_ptr, "i32");
		Module._free(err_ptr);
		this.in_len_ptr = Module._malloc(4);
		this.out_len_ptr = Module._malloc(4)
	}
	SpeexResampler.prototype.process = (function(input) {
		if (!this.handle) throw "disposed object";
		var samples = input.length;
		var outSamples = Math.ceil(samples * this.out_rate / this.in_rate);
		var requireSize = samples * 4;
		if (this.in_capacity < requireSize) {
			if (this.in_ptr) Module._free(this.in_ptr);
			if (this.out_ptr) Module._free(this.out_ptr);
			this.in_ptr = Module._malloc(requireSize);
			this.out_ptr = Module._malloc(outSamples * 4);
			this.in_capacity = requireSize
		}
		var ret;
		Module.setValue(this.in_len_ptr, samples / this.channels, "i32");
		Module.setValue(this.out_len_ptr, outSamples / this.channels, "i32");
		if (input.buffer == Module.HEAPF32.buffer) {
			ret = _speex_resampler_process_interleaved_float(this.handle, input.byteOffset, this.in_len_ptr, this.out_ptr, this.out_len_ptr)
		} else {
			Module.HEAPF32.set(input, this.in_ptr >> 2);
			ret = _speex_resampler_process_interleaved_float(this.handle, this.in_ptr, this.in_len_ptr, this.out_ptr, this.out_len_ptr)
		}
		if (ret != 0) throw "speex_resampler_process_interleaved_float failed: " + ret;
		var ret_samples = Module.getValue(this.out_len_ptr, "i32") * this.channels;
		return Module.HEAPF32.subarray(this.out_ptr >> 2, (this.out_ptr >> 2) + ret_samples)
	});
	SpeexResampler.prototype.destroy = (function() {
		if (!this.handle) return;
		_speex_resampler_destroy(this.handle);
		this.handle = 0;
		Module._free(this.in_len_ptr);
		Module._free(this.out_len_ptr);
		if (this.in_ptr) Module._free(this.in_ptr);
		if (this.out_ptr) Module._free(this.out_ptr);
		this.in_len_ptr = this.out_len_ptr = this.in_ptr = this.out_ptr = 0
	});
	return SpeexResampler
})();
var OpusEncoder = (function() {
	function OpusEncoder(worker) {
		var _this = this;
		this.resampler = null;
		this.buf_pos = 0;
		this.worker = worker;
		this.worker.onmessage = (function(ev) {
			_this.setup(ev.data)
		})
	}
	OpusEncoder.prototype.setup = (function(config) {
		var _this = this;
		var err = Module._malloc(4);
		var app = config.params.application || 2049;
		var sampling_rate = config.params.sampling_rate || config.sampling_rate;
		var frame_duration = config.params.frame_duration || 20;
		if ([2.5, 5, 10, 20, 40, 60].indexOf(frame_duration) < 0) {
			this.worker.postMessage({
				status: -1,
				reason: "invalid frame duration"
			});
			return
		}
		this.frame_size = sampling_rate * frame_duration / 1e3;
		this.channels = config.num_of_channels;
		this.handle = _opus_encoder_create(sampling_rate, config.num_of_channels, app, err);

		// 		https://www.opus-codec.org/docs/html_api/opus__defines_8h_source.html
		// set complexity and bit rate 4010 is a OPUS_SET_COMPLEXITY_REQUEST
		// OPUS_SET_BITRATE_REQUEST - 4002
		// var returnVal = _opus_encoder_ctl(this.handle, 4010, 10);
		// console.log('_opus_encoder_ctl');
		// console.log(returnVal);
		// returnVal = _opus_encoder_ctl(this.handle, 4002, 24000);
		// console.log('_opus_encoder_ctl');
		// console.log(returnVal);
		// var returnVal = _opus_encoder_ctl(this.handle, 4011, 10);
		
		// https://github.com/chris-rudmin/opus-recorder/issues/9
		var targetBitrate = 36000;
		var bitrateLocation = _malloc(4);
		HEAP32[bitrateLocation >>> 2] = targetBitrate;
		_opus_encoder_ctl(
		    this.handle,
		    4002, // this translates to 'OPUS_SET_BITRATE_REQUEST'
		    bitrateLocation)
		  ;
		  _free(bitrateLocation);		



		if (Module.getValue(err, "i32") != 0) {
			this.worker.postMessage({
				status: Module.getValue(err, "i32")
			});
			return
		}
		if (sampling_rate != config.sampling_rate) {
			try {
				this.resampler = new SpeexResampler(config.num_of_channels, config.sampling_rate, sampling_rate)
			} catch (e) {
				this.worker.postMessage({
					status: -1,
					reason: e
				});
				return
			}
		}
		var buf_size = 4 * this.frame_size * this.channels;
		this.buf_ptr = Module._malloc(buf_size);
		this.buf = Module.HEAPF32.subarray(this.buf_ptr / 4, (this.buf_ptr + buf_size) / 4);
		var out_size = 1275 * 3 + 7;
		this.out_ptr = Module._malloc(out_size);
		this.out = Module.HEAPU8.subarray(this.out_ptr, this.out_ptr + out_size);
		this.worker.onmessage = (function(ev) {
			_this.encode(ev.data)
		});
		var opus_header_buf = new ArrayBuffer(19);
		var view8 = new Uint8Array(opus_header_buf);
		var view32 = new Uint32Array(opus_header_buf, 12, 1);
		var magic = "OpusHead";
		for (var i = 0; i < magic.length; ++i) view8[i] = magic.charCodeAt(i);
		view8[8] = 1;
		view8[9] = this.channels;
		view8[10] = view8[11] = 0;
		view32[0] = sampling_rate;
		view8[16] = view8[17] = 0;
		view8[18] = 0;
		this.worker.postMessage({
			status: 0,
			packets: [{
				data: opus_header_buf
			}]
		}, [opus_header_buf])
	});
	OpusEncoder.prototype.encode = (function(data) {
		var samples = data.samples;
		if (this.resampler) {
			try {
				samples = this.resampler.process(samples)
			} catch (e) {
				this.worker.postMessage({
					status: -1,
					reason: e
				});
				return
			}
		}
		var packets = [];
		var transfer_list = [];
		while (samples && samples.length > 0) {
			var size = Math.min(samples.length, this.buf.length - this.buf_pos);
			this.buf.set(samples.subarray(0, size), this.buf_pos);
			this.buf_pos += size;
			samples = samples.subarray(size);
			if (this.buf_pos == this.buf.length) {
				this.buf_pos = 0;
				var ret = _opus_encode_float(this.handle, this.buf_ptr, this.frame_size, this.out_ptr, this.out.byteLength);
				if (ret < 0) {
					this.worker.postMessage({
						status: ret
					});
					return
				}
				var packet = {
					data: (new Uint8Array(this.out.subarray(0, ret))).buffer
				};
				packets.push(packet);
				transfer_list.push(packet.data)
			}
		}
		this.worker.postMessage({
			status: 0,
			packets: packets
		}, transfer_list)
	});
	return OpusEncoder
})();
new OpusEncoder(this)
