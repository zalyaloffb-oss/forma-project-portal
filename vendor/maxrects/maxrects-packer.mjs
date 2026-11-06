function ownKeys(object) {
    var keys = Object.getOwnPropertyNames(object);
    if (typeof Object.getOwnPropertySymbols === "function") {
        keys.push.apply(keys, Object.getOwnPropertySymbols(object));
    }
    return keys;
}
function ownPropertyDescriptors(object) {
    var descriptors = Object.create(null);
    for (var _i = 0, _a = ownKeys(object); _i < _a.length; _i++) {
        var key = _a[_i];
        descriptors[key] = Object.getOwnPropertyDescriptor(object, key);
    }
    return descriptors;
}
var BACKING_FIELDS = {
    _width: true,
    _height: true,
    _x: true,
    _y: true,
    _rot: true,
    _allowRotation: true,
    _data: true,
    _defaultData: true,
    _dirty: true
};
function isPlainEmptyObject(data) {
    return Object.getPrototypeOf(data) === Object.prototype && ownKeys(data).length === 0;
}
var Rectangle = (function () {
    function Rectangle(width, height, x, y, rot, allowRotation) {
        if (width === void 0) { width = 0; }
        if (height === void 0) { height = 0; }
        if (x === void 0) { x = 0; }
        if (y === void 0) { y = 0; }
        if (rot === void 0) { rot = false; }
        if (allowRotation === void 0) { allowRotation = undefined; }
        this.oversized = false;
        this._rot = false;
        this._allowRotation = undefined;
        this._dirty = 0;
        this._width = width;
        this._height = height;
        this._x = x;
        this._y = y;
        this._data = {};
        this._defaultData = this._data;
        this._rot = rot;
        this._allowRotation = allowRotation;
    }
    Rectangle.Collide = function (first, second) {
        return first.collide(second);
    };
    Rectangle.Contain = function (first, second) {
        return first.contain(second);
    };
    Rectangle.Clone = function (rect) {
        var copier = rect.clone;
        var copy;
        if (typeof copier === "function") {
            copy = copier.call(rect);
            var descriptors = ownPropertyDescriptors(rect);
            for (var _i = 0, _a = ownKeys(descriptors); _i < _a.length; _i++) {
                var key = _a[_i];
                var descriptor = descriptors[key];
                if (!("value" in descriptor))
                    continue;
                var own = Object.getOwnPropertyDescriptor(copy, key);
                if (own && (!("value" in own) || !own.configurable || typeof own.value === "function"))
                    continue;
                if (typeof descriptor.value === "function")
                    continue;
                Object.defineProperty(copy, key, descriptor);
            }
        }
        else {
            copy = Object.create(Object.getPrototypeOf(rect));
            Object.defineProperties(copy, ownPropertyDescriptors(rect));
        }
        try {
            void copy.width;
            void copy.height;
            void copy.x;
            void copy.y;
            void copy.rot;
            void copy.data;
        }
        catch (_b) {
            throw new Error("Rectangle.Clone(): the rect keeps its state out of reach of a copy (an ECMAScript #private field, say) — give its class a clone() method");
        }
        return copy;
    };
    Rectangle.prototype.area = function () {
        return this.width * this.height;
    };
    Rectangle.prototype.toJSON = function () {
        var json = {
            width: this.width,
            height: this.height,
            x: this.x,
            y: this.y,
            rot: this.rot
        };
        for (var _i = 0, _a = Object.keys(this); _i < _a.length; _i++) {
            var key = _a[_i];
            if (Object.prototype.hasOwnProperty.call(BACKING_FIELDS, key))
                continue;
            if (key === "oversized" && !this.oversized)
                continue;
            if (key === "__proto__") {
                Object.defineProperty(json, key, {
                    value: this[key],
                    enumerable: true,
                    configurable: true,
                    writable: true
                });
                continue;
            }
            json[key] = this[key];
        }
        var data = this.data;
        if (!(data === this._defaultData && isPlainEmptyObject(data)))
            json.data = data;
        var allowRotation = this.allowRotation;
        if (allowRotation !== undefined)
            json.allowRotation = allowRotation;
        return json;
    };
    Rectangle.prototype.collide = function (rect) {
        return (rect.x < this.x + this.width &&
            rect.x + rect.width > this.x &&
            rect.y < this.y + this.height &&
            rect.y + rect.height > this.y);
    };
    Rectangle.prototype.contain = function (rect) {
        return (rect.x >= this.x &&
            rect.y >= this.y &&
            rect.x + rect.width <= this.x + this.width &&
            rect.y + rect.height <= this.y + this.height);
    };
    Object.defineProperty(Rectangle.prototype, "width", {
        get: function () {
            return this._width;
        },
        set: function (value) {
            if (value === this._width)
                return;
            this._width = value;
            this._dirty++;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "height", {
        get: function () {
            return this._height;
        },
        set: function (value) {
            if (value === this._height)
                return;
            this._height = value;
            this._dirty++;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "x", {
        get: function () {
            return this._x;
        },
        set: function (value) {
            if (value === this._x)
                return;
            this._x = value;
            this._dirty++;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "y", {
        get: function () {
            return this._y;
        },
        set: function (value) {
            if (value === this._y)
                return;
            this._y = value;
            this._dirty++;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "rot", {
        get: function () {
            return this._rot;
        },
        set: function (value) {
            if (this._allowRotation === false)
                return;
            if (this._rot !== value) {
                var tmp = this.width;
                this.width = this.height;
                this.height = tmp;
                this._rot = value;
                this._dirty++;
            }
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "allowRotation", {
        get: function () {
            return this._allowRotation;
        },
        set: function (value) {
            if (this._allowRotation !== value) {
                this._allowRotation = value;
                this._dirty++;
            }
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "data", {
        get: function () {
            return this._data;
        },
        set: function (value) {
            if (value === this._data)
                return;
            this._data = value;
            if (value !== null &&
                typeof value === "object" &&
                Object.prototype.hasOwnProperty.call(value, "allowRotation")) {
                this._allowRotation = value.allowRotation;
            }
            this._dirty++;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rectangle.prototype, "dirty", {
        get: function () {
            return this._dirty > 0;
        },
        enumerable: false,
        configurable: true
    });
    Rectangle.prototype.setDirty = function (value) {
        if (value === void 0) { value = true; }
        this._dirty = value ? this._dirty + 1 : 0;
    };
    return Rectangle;
}());

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var EDGE_MAX_VALUE = 4096;
var PACKING_LOGIC;
(function (PACKING_LOGIC) {
    PACKING_LOGIC[PACKING_LOGIC["MAX_AREA"] = 0] = "MAX_AREA";
    PACKING_LOGIC[PACKING_LOGIC["MAX_EDGE"] = 1] = "MAX_EDGE";
    PACKING_LOGIC[PACKING_LOGIC["FILL_WIDTH"] = 2] = "FILL_WIDTH";
})(PACKING_LOGIC || (PACKING_LOGIC = {}));

var Bin = (function () {
    function Bin() {
        this._dirty = 0;
    }
    Object.defineProperty(Bin.prototype, "dirty", {
        get: function () {
            return this._dirty > 0 || this.rects.some(function (rect) { return rect.dirty; });
        },
        enumerable: false,
        configurable: true
    });
    Bin.prototype.setDirty = function (value) {
        if (value === void 0) { value = true; }
        this._dirty = value ? this._dirty + 1 : 0;
        if (!value) {
            for (var _i = 0, _a = this.rects; _i < _a.length; _i++) {
                var rect = _a[_i];
                if (rect.setDirty)
                    rect.setDirty(false);
            }
        }
    };
    return Bin;
}());

function undoBinRotation(rect) {
    var width = rect.width;
    var height = rect.height;
    rect.rot = !rect.rot;
    rect.width = height;
    rect.height = width;
}
var MaxRectsBin = (function (_super) {
    __extends(MaxRectsBin, _super);
    function MaxRectsBin(maxWidth, maxHeight, padding, options) {
        if (maxWidth === void 0) { maxWidth = EDGE_MAX_VALUE; }
        if (maxHeight === void 0) { maxHeight = EDGE_MAX_VALUE; }
        if (padding === void 0) { padding = 0; }
        if (options === void 0) { options = {}; }
        var _this = _super.call(this) || this;
        _this.maxWidth = maxWidth;
        _this.maxHeight = maxHeight;
        _this.padding = padding;
        _this.freeRects = [];
        _this.rects = [];
        _this.verticalExpand = false;
        _this.turnedByPlacement = [];
        _this.options = {
            smart: true,
            pot: true,
            square: false,
            allowRotation: false,
            tag: false,
            exclusiveTag: true,
            border: 0,
            logic: PACKING_LOGIC.MAX_EDGE
        };
        if (typeof padding === "number" && !isFinite(padding)) {
            throw new Error("MaxRectsBin: padding must not be NaN or Infinity, got " +
                String(padding) +
                " — the constructor is (maxWidth, maxHeight, padding, options)");
        }
        _this.options = __assign(__assign({}, _this.options), options);
        _this.width = _this.options.smart ? 0 : maxWidth;
        _this.height = _this.options.smart ? 0 : maxHeight;
        _this.border = _this.options.border ? _this.options.border : 0;
        _this.freeRects.push(new Rectangle(_this.maxWidth + _this.padding - _this.border * 2, _this.maxHeight + _this.padding - _this.border * 2, _this.border, _this.border));
        _this.stage = new Rectangle(_this.width, _this.height);
        return _this;
    }
    MaxRectsBin.prototype.add = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var rect;
        if (args.length === 1) {
            if (typeof args[0] !== "object")
                throw new Error("MacrectsBin.add(): Wrong parameters");
            rect = args[0];
        }
        else {
            rect = new Rectangle(args[0], args[1]);
            if (args.length > 2)
                rect.data = args[2];
            rect.setDirty(false);
        }
        var wasRotated = rect.rot === true;
        var result = this.place(rect);
        if (result) {
            this.rects.push(result);
            this.turnedByPlacement.push({ rect: result, turned: this.turnedBy(wasRotated, result) });
        }
        return result;
    };
    MaxRectsBin.prototype.repack = function () {
        var unpacked = [];
        this.reset();
        this.rects.sort(function (a, b) {
            var result = Math.max(b.width, b.height) - Math.max(a.width, a.height);
            if (result === 0 && a.hash && b.hash) {
                return a.hash > b.hash ? -1 : 1;
            }
            else
                return result;
        });
        this.turnedByPlacement = [];
        for (var _i = 0, _a = this.rects; _i < _a.length; _i++) {
            var rect = _a[_i];
            var wasRotated = rect.rot === true;
            if (this.place(rect)) {
                this.turnedByPlacement.push({ rect: rect, turned: this.turnedBy(wasRotated, rect) });
            }
            else {
                unpacked.push(rect);
            }
        }
        for (var _b = 0, unpacked_1 = unpacked; _b < unpacked_1.length; _b++) {
            var rect = unpacked_1[_b];
            this.rects.splice(this.rects.indexOf(rect), 1);
        }
        return unpacked.length > 0 ? unpacked : undefined;
    };
    MaxRectsBin.prototype.reset = function (deepReset, resetOption) {
        if (deepReset === void 0) { deepReset = false; }
        if (resetOption === void 0) { resetOption = false; }
        if (deepReset) {
            if (this.data)
                delete this.data;
            if (this.tag)
                delete this.tag;
            this.rects = [];
            this.turnedByPlacement = [];
            if (resetOption) {
                this.options = {
                    smart: true,
                    pot: true,
                    square: true,
                    allowRotation: false,
                    tag: false,
                    border: 0
                };
            }
        }
        this.width = this.options.smart ? 0 : this.maxWidth;
        this.height = this.options.smart ? 0 : this.maxHeight;
        this.border = this.options.border ? this.options.border : 0;
        this.freeRects = [
            new Rectangle(this.maxWidth + this.padding - this.border * 2, this.maxHeight + this.padding - this.border * 2, this.border, this.border)
        ];
        this.stage = new Rectangle(this.width, this.height);
        this._dirty = 0;
    };
    MaxRectsBin.prototype.clone = function () {
        var clonedBin = new MaxRectsBin(this.maxWidth, this.maxHeight, this.padding, __assign(__assign({}, this.options), { exclusiveTag: false }));
        for (var index = 0; index < this.rects.length; index++) {
            var rect = this.rects[index];
            var copy = Rectangle.Clone(rect);
            if (this.turned(index, rect))
                undoBinRotation(copy);
            if (clonedBin.add(copy) === undefined) {
                var stored = this.turned(index, rect) ? Rectangle.Clone(rect) : undefined;
                if (!stored || clonedBin.add(stored) === undefined) {
                    throw new Error("MaxRectsBin.clone(): the bin holds a rect it can no longer place, so the copy would be incomplete — repack the bin before cloning it");
                }
            }
        }
        clonedBin.options = __assign({}, this.options);
        clonedBin.tag = this.tag;
        clonedBin.data = this.data;
        return clonedBin;
    };
    MaxRectsBin.prototype.turned = function (index, rect) {
        var entry = this.turnedByPlacement[index];
        return entry !== undefined && entry.rect === rect && entry.turned;
    };
    MaxRectsBin.prototype.turnedBy = function (wasRotated, rect) {
        return wasRotated !== (rect.rot === true);
    };
    MaxRectsBin.prototype.place = function (rect) {
        var tag = rect.data && rect.data.tag ? rect.data.tag : rect.tag ? rect.tag : undefined;
        if (this.options.tag && this.options.exclusiveTag && (this.tag || undefined) !== tag)
            return undefined;
        var node;
        var allowRotation;
        if (Object.prototype.hasOwnProperty.call(rect, "_allowRotation") && rect.allowRotation !== undefined) {
            allowRotation = rect.allowRotation;
        }
        else {
            allowRotation = this.options.allowRotation;
        }
        node = this.findNode(rect.width + this.padding, rect.height + this.padding, allowRotation);
        if (node) {
            var fitted = !this.options.smart || this.updateBinSize(node, false) || this.stage.contain(node);
            if (!fitted)
                return undefined;
            var numRectToProcess = this.freeRects.length;
            var i = 0;
            while (i < numRectToProcess) {
                if (this.splitNode(this.freeRects[i], node)) {
                    this.freeRects.splice(i, 1);
                    numRectToProcess--;
                    i--;
                }
                i++;
            }
            this.pruneFreeList();
            this.verticalExpand = this.options.logic !== PACKING_LOGIC.FILL_WIDTH && this.width > this.height;
            rect.x = node.x;
            rect.y = node.y;
            if (rect.rot === undefined)
                rect.rot = false;
            var rotated = rect.rot;
            var width = rect.width;
            var height = rect.height;
            rect.rot = node.rot ? !rotated : rotated;
            if (rect.rot !== rotated && rect.width === width && rect.height === height) {
                rect.width = height;
                rect.height = width;
            }
            this._dirty++;
            return rect;
        }
        else if (!this.verticalExpand) {
            if (this.updateBinSize(new Rectangle(rect.width + this.padding, rect.height + this.padding, this.width + this.padding - this.border, this.border)) ||
                this.updateBinSize(new Rectangle(rect.width + this.padding, rect.height + this.padding, this.border, this.height + this.padding - this.border))) {
                return this.place(rect);
            }
        }
        else {
            if (this.updateBinSize(new Rectangle(rect.width + this.padding, rect.height + this.padding, this.border, this.height + this.padding - this.border)) ||
                this.updateBinSize(new Rectangle(rect.width + this.padding, rect.height + this.padding, this.width + this.padding - this.border, this.border))) {
                return this.place(rect);
            }
        }
        return undefined;
    };
    MaxRectsBin.prototype.findNode = function (width, height, allowRotation) {
        var _this = this;
        var score = Number.MAX_VALUE;
        var areaFit;
        var r;
        var bestNode;
        var _loop_1 = function (i) {
            r = this_1.freeRects[i];
            if (r.width >= width && r.height >= height) {
                if (this_1.options.logic === PACKING_LOGIC.MAX_AREA) {
                    areaFit = r.width * r.height - width * height;
                }
                else if (this_1.options.logic === PACKING_LOGIC.FILL_WIDTH) {
                    var currentRectPositionScore_1 = r.x + r.y * this_1.maxWidth;
                    var numberOfBetterRects = this_1.freeRects.filter(function (rect) { return rect.x + rect.y * _this.maxWidth < currentRectPositionScore_1; }).length;
                    var heightToGain = r.y + height - this_1.height;
                    areaFit = numberOfBetterRects + heightToGain;
                }
                else {
                    areaFit = Math.min(r.width - width, r.height - height);
                }
                if (areaFit < score) {
                    bestNode = new Rectangle(width, height, r.x, r.y);
                    score = areaFit;
                }
            }
            if (!allowRotation)
                return "continue";
            if (r.width >= height && r.height >= width) {
                if (this_1.options.logic === PACKING_LOGIC.MAX_AREA) {
                    areaFit = r.width * r.height - height * width;
                }
                else if (this_1.options.logic === PACKING_LOGIC.FILL_WIDTH) {
                    var currentRectPositionScore_2 = r.x + r.y * this_1.maxWidth;
                    var numberOfBetterRects = this_1.freeRects.filter(function (rect) { return rect.x + rect.y * _this.maxWidth < currentRectPositionScore_2; }).length;
                    var heightToGain = r.y + width - this_1.height;
                    areaFit = numberOfBetterRects + heightToGain;
                }
                else {
                    areaFit = Math.min(r.height - width, r.width - height);
                }
                if (areaFit < score) {
                    bestNode = new Rectangle(height, width, r.x, r.y, true);
                    score = areaFit;
                }
            }
        };
        var this_1 = this;
        for (var i in this.freeRects) {
            _loop_1(i);
        }
        return bestNode;
    };
    MaxRectsBin.prototype.splitNode = function (freeRect, usedNode) {
        if (!freeRect.collide(usedNode))
            return false;
        if (usedNode.y > freeRect.y && usedNode.y < freeRect.y + freeRect.height) {
            var newNode = new Rectangle(freeRect.width, usedNode.y - freeRect.y, freeRect.x, freeRect.y);
            this.freeRects.push(newNode);
        }
        if (usedNode.y + usedNode.height < freeRect.y + freeRect.height) {
            var newNode = new Rectangle(freeRect.width, freeRect.y + freeRect.height - (usedNode.y + usedNode.height), freeRect.x, usedNode.y + usedNode.height);
            this.freeRects.push(newNode);
        }
        if (usedNode.x > freeRect.x && usedNode.x < freeRect.x + freeRect.width) {
            var newNode = new Rectangle(usedNode.x - freeRect.x, freeRect.height, freeRect.x, freeRect.y);
            this.freeRects.push(newNode);
        }
        if (usedNode.x + usedNode.width < freeRect.x + freeRect.width) {
            var newNode = new Rectangle(freeRect.x + freeRect.width - (usedNode.x + usedNode.width), freeRect.height, usedNode.x + usedNode.width, freeRect.y);
            this.freeRects.push(newNode);
        }
        return true;
    };
    MaxRectsBin.prototype.pruneFreeList = function () {
        var i = 0;
        var j = 0;
        var len = this.freeRects.length;
        while (i < len) {
            j = i + 1;
            var tmpRect1 = this.freeRects[i];
            while (j < len) {
                var tmpRect2 = this.freeRects[j];
                if (tmpRect2.contain(tmpRect1)) {
                    this.freeRects.splice(i, 1);
                    i--;
                    len--;
                    break;
                }
                if (tmpRect1.contain(tmpRect2)) {
                    this.freeRects.splice(j, 1);
                    j--;
                    len--;
                }
                j++;
            }
            i++;
        }
    };
    MaxRectsBin.prototype.updateBinSize = function (node, considerRotation) {
        if (considerRotation === void 0) { considerRotation = true; }
        if (!this.options.smart)
            return false;
        if (this.stage.contain(node))
            return false;
        var tmpWidth = Math.max(this.width, node.x + node.width - this.padding + this.border);
        var tmpHeight = Math.max(this.height, node.y + node.height - this.padding + this.border);
        var tmpFits = !(tmpWidth > this.maxWidth || tmpHeight > this.maxHeight);
        if (this.options.allowRotation && considerRotation) {
            var rotWidth = Math.max(this.width, node.x + node.height - this.padding + this.border);
            var rotHeight = Math.max(this.height, node.y + node.width - this.padding + this.border);
            var rotFits = !(rotWidth > this.maxWidth || rotHeight > this.maxHeight);
            if (tmpFits && rotFits && rotWidth * rotHeight < tmpWidth * tmpHeight) {
                tmpWidth = rotWidth;
                tmpHeight = rotHeight;
            }
            if (rotFits && !tmpFits) {
                tmpWidth = rotWidth;
                tmpHeight = rotHeight;
            }
        }
        if (this.options.pot) {
            tmpWidth = Math.pow(2, Math.ceil(Math.log(tmpWidth) * Math.LOG2E));
            tmpHeight = Math.pow(2, Math.ceil(Math.log(tmpHeight) * Math.LOG2E));
        }
        if (this.options.square) {
            tmpWidth = tmpHeight = Math.max(tmpWidth, tmpHeight);
        }
        tmpFits =
            isFinite(tmpWidth) && isFinite(tmpHeight) && !(tmpWidth > this.maxWidth || tmpHeight > this.maxHeight);
        if (!tmpFits) {
            return false;
        }
        this.expandFreeRects(tmpWidth + this.padding, tmpHeight + this.padding);
        this.width = this.stage.width = tmpWidth;
        this.height = this.stage.height = tmpHeight;
        return true;
    };
    MaxRectsBin.prototype.expandFreeRects = function (width, height) {
        var _this = this;
        this.freeRects.forEach(function (freeRect) {
            if (freeRect.x + freeRect.width >= Math.min(_this.width + _this.padding - _this.border, width)) {
                freeRect.width = width - freeRect.x - _this.border;
            }
            if (freeRect.y + freeRect.height >= Math.min(_this.height + _this.padding - _this.border, height)) {
                freeRect.height = height - freeRect.y - _this.border;
            }
        }, this);
        this.freeRects.push(new Rectangle(width - this.width - this.padding, height - this.border * 2, this.width + this.padding - this.border, this.border));
        this.freeRects.push(new Rectangle(width - this.border * 2, height - this.height - this.padding, this.border, this.height + this.padding - this.border));
        this.freeRects = this.freeRects.filter(function (freeRect) {
            return !(freeRect.width <= 0 ||
                freeRect.height <= 0 ||
                freeRect.x < _this.border ||
                freeRect.y < _this.border);
        });
        this.pruneFreeList();
    };
    return MaxRectsBin;
}(Bin));

var OversizedElementBin = (function (_super) {
    __extends(OversizedElementBin, _super);
    function OversizedElementBin() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var _this = _super.call(this) || this;
        _this.rects = [];
        if (args.length === 1) {
            if (typeof args[0] !== "object")
                throw new Error("OversizedElementBin: Wrong parameters");
            var rect = args[0];
            _this.rects = [rect];
            _this.width = rect.width;
            _this.height = rect.height;
            _this.data = rect.data;
            rect.oversized = true;
        }
        else {
            _this.width = args[0];
            _this.height = args[1];
            _this.data = args.length > 2 ? args[2] : null;
            var rect = new Rectangle(_this.width, _this.height);
            rect.oversized = true;
            if (args.length > 2)
                rect.data = _this.data;
            _this.rects.push(rect);
        }
        _this.freeRects = [];
        _this.maxWidth = _this.width;
        _this.maxHeight = _this.height;
        _this.options = { smart: false, pot: false, square: false };
        return _this;
    }
    OversizedElementBin.prototype.add = function () {
        return undefined;
    };
    OversizedElementBin.prototype.reset = function (_deepReset) {
    };
    OversizedElementBin.prototype.repack = function () {
        return undefined;
    };
    OversizedElementBin.prototype.clone = function () {
        var clonedBin = new OversizedElementBin(Rectangle.Clone(this.rects[0]));
        clonedBin.width = this.width;
        clonedBin.height = this.height;
        clonedBin.maxWidth = this.maxWidth;
        clonedBin.maxHeight = this.maxHeight;
        clonedBin.options = __assign({}, this.options);
        clonedBin.freeRects = this.freeRects.map(function (rect) { return Rectangle.Clone(rect); });
        clonedBin.tag = this.tag;
        clonedBin.data = this.data;
        return clonedBin;
    };
    return OversizedElementBin;
}(Bin));

function find(items, predicate) {
    for (var i = 0; i < items.length; i++) {
        if (predicate(items[i]))
            return items[i];
    }
    return undefined;
}
var MaxRectsPacker = (function () {
    function MaxRectsPacker(width, height, padding, options) {
        if (width === void 0) { width = EDGE_MAX_VALUE; }
        if (height === void 0) { height = EDGE_MAX_VALUE; }
        if (padding === void 0) { padding = 0; }
        if (options === void 0) { options = {}; }
        this.width = width;
        this.height = height;
        this.padding = padding;
        this.options = {
            smart: true,
            pot: true,
            square: false,
            allowRotation: false,
            tag: false,
            exclusiveTag: true,
            border: 0,
            logic: PACKING_LOGIC.MAX_EDGE
        };
        this._currentBinIndex = 0;
        if (typeof padding === "number" && !isFinite(padding)) {
            throw new Error("MaxRectsPacker: padding must not be NaN or Infinity, got " +
                String(padding) +
                " — the constructor is (width, height, padding, options)");
        }
        this.bins = [];
        this.options = __assign(__assign({}, this.options), options);
    }
    MaxRectsPacker.prototype.add = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (args.length === 1) {
            if (typeof args[0] !== "object")
                throw new Error("MacrectsPacker.add(): Wrong parameters");
            var rect_1 = args[0];
            if (!((rect_1.width <= this.width && rect_1.height <= this.height) ||
                (this.options.allowRotation && rect_1.width <= this.height && rect_1.height <= this.width))) {
                this.bins.push(new OversizedElementBin(rect_1));
            }
            else {
                var added = find(this.bins.slice(this._currentBinIndex), function (bin) { return bin.add(rect_1) !== undefined; });
                if (!added) {
                    var bin = new MaxRectsBin(this.width, this.height, this.padding, this.options);
                    var tag = rect_1.data && rect_1.data.tag ? rect_1.data.tag : rect_1.tag ? rect_1.tag : undefined;
                    if (this.options.tag && this.options.exclusiveTag && tag)
                        bin.tag = tag;
                    if (this.addToBin(bin, rect_1))
                        this.bins.push(bin);
                }
            }
            return rect_1;
        }
        else {
            var rect_2 = new Rectangle(args[0], args[1]);
            if (args.length > 2)
                rect_2.data = args[2];
            if (!((rect_2.width <= this.width && rect_2.height <= this.height) ||
                (this.options.allowRotation && rect_2.width <= this.height && rect_2.height <= this.width))) {
                this.bins.push(new OversizedElementBin(rect_2));
            }
            else {
                var added = find(this.bins.slice(this._currentBinIndex), function (bin) { return bin.add(rect_2) !== undefined; });
                if (!added) {
                    var bin = new MaxRectsBin(this.width, this.height, this.padding, this.options);
                    if (this.options.tag && this.options.exclusiveTag && rect_2.data && rect_2.data.tag)
                        bin.tag = rect_2.data.tag;
                    if (this.addToBin(bin, rect_2))
                        this.bins.push(bin);
                }
            }
            return rect_2;
        }
    };
    MaxRectsPacker.prototype.addToBin = function (bin, rect) {
        if (bin.add(rect) !== undefined)
            return true;
        this.bins.push(new OversizedElementBin(rect));
        return false;
    };
    MaxRectsPacker.prototype.addArray = function (input) {
        var _this = this;
        if (!this.options.tag || this.options.exclusiveTag) {
            this.sort(input, this.options.logic).forEach(function (rect) { return _this.add(rect); });
        }
        else {
            var rects_1 = input.slice();
            if (rects_1.length === 0)
                return;
            rects_1.sort(function (a, b) {
                var aTag = a.data && a.data.tag ? a.data.tag : a.tag ? a.tag : undefined;
                var bTag = b.data && b.data.tag ? b.data.tag : b.tag ? b.tag : undefined;
                return bTag === undefined ? -1 : aTag === undefined ? 1 : bTag > aTag ? -1 : 1;
            });
            var currentTag_1;
            var currentIdx_1 = 0;
            var targetBin = find(this.bins.slice(this._currentBinIndex), function (bin) {
                var testBin;
                try {
                    testBin = bin.clone();
                }
                catch (_a) {
                    return false;
                }
                for (var i = currentIdx_1; i < rects_1.length; i++) {
                    var rect = rects_1[i];
                    var tag = rect.data && rect.data.tag ? rect.data.tag : rect.tag ? rect.tag : undefined;
                    if (i === 0)
                        currentTag_1 = tag;
                    if (tag !== currentTag_1) {
                        currentTag_1 = tag;
                        _this.sort(rects_1.slice(currentIdx_1, i), _this.options.logic).forEach(function (r) { return _this.addToBin(bin, r); });
                        currentIdx_1 = i;
                        _this.addArray(rects_1.slice(i));
                        return true;
                    }
                    if (tag === undefined) {
                        _this.sort(rects_1.slice(i), _this.options.logic).forEach(function (r) { return _this.add(r); });
                        currentIdx_1 = rects_1.length;
                        return true;
                    }
                    if (testBin.add(rect) === undefined) {
                        _this.sort(rects_1.slice(currentIdx_1, i), _this.options.logic).forEach(function (r) { return _this.addToBin(bin, r); });
                        currentIdx_1 = i;
                        return false;
                    }
                }
                _this.sort(rects_1.slice(currentIdx_1), _this.options.logic).forEach(function (r) { return _this.addToBin(bin, r); });
                return true;
            });
            if (!targetBin) {
                var rect = rects_1[currentIdx_1];
                var bin = new MaxRectsBin(this.width, this.height, this.padding, this.options);
                if (this.addToBin(bin, rect))
                    this.bins.push(bin);
                currentIdx_1++;
                this.addArray(rects_1.slice(currentIdx_1));
            }
        }
    };
    MaxRectsPacker.prototype.reset = function () {
        this.bins = [];
        this._currentBinIndex = 0;
    };
    MaxRectsPacker.prototype.repack = function (quick) {
        if (quick === void 0) { quick = true; }
        if (quick) {
            var unpack = [];
            for (var _i = 0, _a = this.bins; _i < _a.length; _i++) {
                var bin = _a[_i];
                if (bin.dirty) {
                    var up = bin.repack();
                    if (up)
                        unpack.push.apply(unpack, up);
                }
            }
            this.addArray(unpack);
            return;
        }
        if (!this.dirty)
            return;
        var allRects = this.rects;
        this.reset();
        this.addArray(allRects);
    };
    MaxRectsPacker.prototype.next = function () {
        this._currentBinIndex = this.bins.length;
        return this._currentBinIndex;
    };
    MaxRectsPacker.prototype.load = function (bins) {
        var _this = this;
        bins.forEach(function (bin, index) {
            if (bin.maxWidth > _this.width || bin.maxHeight > _this.height) {
                var placeholder = new OversizedElementBin(bin.width, bin.height, {});
                placeholder.maxWidth = bin.maxWidth;
                placeholder.maxHeight = bin.maxHeight;
                if (bin.options)
                    placeholder.options = __assign({}, bin.options);
                if (bin.tag !== undefined)
                    placeholder.tag = bin.tag;
                _this.restoreFreeRects(bin, placeholder);
                _this.bins[index] = placeholder;
            }
            else {
                var newBin = new MaxRectsBin(_this.width, _this.height, _this.padding, bin.options);
                _this.restoreFreeRects(bin, newBin);
                newBin.width = bin.width;
                newBin.height = bin.height;
                if (bin.tag !== undefined)
                    newBin.tag = bin.tag;
                _this.bins[index] = newBin;
            }
        }, this);
    };
    MaxRectsPacker.prototype.restoreFreeRects = function (bin, target) {
        target.freeRects.splice(0);
        bin.freeRects.forEach(function (r) { return target.freeRects.push(new Rectangle(r.width, r.height, r.x, r.y)); });
    };
    MaxRectsPacker.prototype.save = function () {
        var saveBins = [];
        this.bins.forEach(function (bin) {
            var saveBin = {
                width: bin.width,
                height: bin.height,
                maxWidth: bin.maxWidth,
                maxHeight: bin.maxHeight,
                freeRects: [],
                rects: [],
                options: __assign({}, bin.options)
            };
            if (bin.tag !== undefined)
                saveBin = __assign(__assign({}, saveBin), { tag: bin.tag });
            bin.freeRects.forEach(function (r) {
                saveBin.freeRects.push({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height
                });
            });
            saveBins.push(saveBin);
        });
        return saveBins;
    };
    MaxRectsPacker.prototype.sort = function (rects, logic) {
        if (logic === void 0) { logic = PACKING_LOGIC.MAX_EDGE; }
        return rects.slice().sort(function (a, b) {
            var result = logic === PACKING_LOGIC.MAX_EDGE
                ? Math.max(b.width, b.height) - Math.max(a.width, a.height)
                : b.width * b.height - a.width * a.height;
            if (result === 0 && a.hash && b.hash) {
                return a.hash > b.hash ? -1 : 1;
            }
            else
                return result;
        });
    };
    Object.defineProperty(MaxRectsPacker.prototype, "currentBinIndex", {
        get: function () {
            return this._currentBinIndex;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(MaxRectsPacker.prototype, "dirty", {
        get: function () {
            return this.bins.some(function (bin) { return bin.dirty; });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(MaxRectsPacker.prototype, "rects", {
        get: function () {
            var allRects = [];
            for (var _i = 0, _a = this.bins; _i < _a.length; _i++) {
                var bin = _a[_i];
                allRects.push.apply(allRects, bin.rects);
            }
            return allRects;
        },
        enumerable: false,
        configurable: true
    });
    return MaxRectsPacker;
}());

export { Bin, MaxRectsBin, MaxRectsPacker, OversizedElementBin, PACKING_LOGIC, Rectangle };
//# sourceMappingURL=maxrects-packer.mjs.map
