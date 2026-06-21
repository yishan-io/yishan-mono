#include "bridge.h"

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <ImageIO/ImageIO.h>

#include <stdlib.h>
#include <string.h>

static char *ys_json_string(id object) {
    if (object == nil) {
        return NULL;
    }
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:&error];
    if (data == nil || error != nil) {
        return NULL;
    }
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (json == nil) {
        return NULL;
    }
    const char *utf8 = [json UTF8String];
    if (utf8 == NULL) {
        return NULL;
    }
    return strdup(utf8);
}

static NSString *ys_cfstring_value(CFTypeRef value) {
    if (value == NULL) {
        return @"";
    }
    if (CFGetTypeID(value) == CFStringGetTypeID()) {
        return (__bridge NSString *)value;
    }
    if (CFGetTypeID(value) == CFNumberGetTypeID()) {
        return [(__bridge NSNumber *)value stringValue];
    }
    return @"";
}

static BOOL ys_cfbool_value(CFTypeRef value) {
    if (value == NULL || CFGetTypeID(value) != CFBooleanGetTypeID()) {
        return NO;
    }
    return CFBooleanGetValue(value);
}

static CGRect ys_ax_frame(AXUIElementRef element) {
    CGRect frame = CGRectZero;
    CFTypeRef positionValue = NULL;
    CFTypeRef sizeValue = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXPositionAttribute, &positionValue) == kAXErrorSuccess && positionValue != NULL) {
        CGPoint point = CGPointZero;
        AXValueGetValue(positionValue, kAXValueCGPointType, &point);
        frame.origin = point;
        CFRelease(positionValue);
    }
    if (AXUIElementCopyAttributeValue(element, kAXSizeAttribute, &sizeValue) == kAXErrorSuccess && sizeValue != NULL) {
        CGSize size = CGSizeZero;
        AXValueGetValue(sizeValue, kAXValueCGSizeType, &size);
        frame.size = size;
        CFRelease(sizeValue);
    }
    return frame;
}

static BOOL ys_element_is_sensitive(NSString *role, NSString *subrole) {
    NSString *normalizedRole = role ?: @"";
    NSString *normalizedSubrole = subrole ?: @"";
    return [normalizedSubrole isEqualToString:@"AXSecureTextField"] ||
        [normalizedRole isEqualToString:@"AXSecureTextField"];
}

static NSMutableArray<NSString *> *ys_action_names(AXUIElementRef element) {
    CFArrayRef actionNames = NULL;
    if (AXUIElementCopyActionNames(element, &actionNames) != kAXErrorSuccess || actionNames == NULL) {
        return [NSMutableArray array];
    }
    NSMutableArray<NSString *> *result = [NSMutableArray array];
    for (id action in (__bridge NSArray *)actionNames) {
        if ([action isKindOfClass:[NSString class]]) {
            [result addObject:action];
        }
    }
    CFRelease(actionNames);
    return result;
}

static AXUIElementRef ys_copy_child_at_index(AXUIElementRef element, NSInteger index) {
    CFTypeRef childrenValue = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &childrenValue) != kAXErrorSuccess || childrenValue == NULL) {
        return NULL;
    }
    NSArray *children = (__bridge NSArray *)childrenValue;
    AXUIElementRef child = NULL;
    if (index >= 0 && index < (NSInteger)children.count) {
        child = (__bridge AXUIElementRef)children[index];
        CFRetain(child);
    }
    CFRelease(childrenValue);
    return child;
}

static NSMutableDictionary *ys_build_ax_node(AXUIElementRef element, int pid, NSString *path, int depth, int maxDepth, int maxNodes, int *nodeCount, BOOL redactSensitive) {
    if (element == NULL || *nodeCount >= maxNodes) {
        return nil;
    }
    (*nodeCount)++;

    CFTypeRef roleValue = NULL;
    CFTypeRef subroleValue = NULL;
    CFTypeRef titleValue = NULL;
    CFTypeRef descriptionValue = NULL;
    CFTypeRef valueValue = NULL;
    CFTypeRef enabledValue = NULL;
    CFTypeRef focusedValue = NULL;
    CFTypeRef selectedValue = NULL;
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute, &roleValue);
    AXUIElementCopyAttributeValue(element, kAXSubroleAttribute, &subroleValue);
    AXUIElementCopyAttributeValue(element, kAXTitleAttribute, &titleValue);
    AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute, &descriptionValue);
    AXUIElementCopyAttributeValue(element, kAXValueAttribute, &valueValue);
    AXUIElementCopyAttributeValue(element, kAXEnabledAttribute, &enabledValue);
    AXUIElementCopyAttributeValue(element, kAXFocusedAttribute, &focusedValue);
    AXUIElementCopyAttributeValue(element, kAXSelectedAttribute, &selectedValue);

    NSString *role = ys_cfstring_value(roleValue);
    NSString *subrole = ys_cfstring_value(subroleValue);
    BOOL sensitive = ys_element_is_sensitive(role, subrole);
    NSString *value = ys_cfstring_value(valueValue);
    if (redactSensitive && sensitive) {
        value = @"[redacted]";
    }
    CGRect frame = ys_ax_frame(element);
    NSMutableDictionary *node = [NSMutableDictionary dictionary];
    node[@"id"] = [NSString stringWithFormat:@"ax_%d_%@", pid, path];
    node[@"role"] = role;
    node[@"subrole"] = subrole;
    node[@"title"] = ys_cfstring_value(titleValue);
    node[@"description"] = ys_cfstring_value(descriptionValue);
    node[@"value"] = value;
    node[@"enabled"] = @(ys_cfbool_value(enabledValue));
    node[@"focused"] = @(ys_cfbool_value(focusedValue));
    node[@"selected"] = @(ys_cfbool_value(selectedValue));
    node[@"sensitive"] = @(sensitive);
    node[@"frame"] = @{
        @"x": @(frame.origin.x),
        @"y": @(frame.origin.y),
        @"width": @(frame.size.width),
        @"height": @(frame.size.height),
    };
    node[@"actions"] = ys_action_names(element);

    if (roleValue != NULL) { CFRelease(roleValue); }
    if (subroleValue != NULL) { CFRelease(subroleValue); }
    if (titleValue != NULL) { CFRelease(titleValue); }
    if (descriptionValue != NULL) { CFRelease(descriptionValue); }
    if (valueValue != NULL) { CFRelease(valueValue); }
    if (enabledValue != NULL) { CFRelease(enabledValue); }
    if (focusedValue != NULL) { CFRelease(focusedValue); }
    if (selectedValue != NULL) { CFRelease(selectedValue); }

    if (depth >= maxDepth || *nodeCount >= maxNodes) {
        node[@"children"] = @[];
        return node;
    }

    CFTypeRef childrenValue = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &childrenValue) != kAXErrorSuccess || childrenValue == NULL) {
        node[@"children"] = @[];
        return node;
    }
    NSArray *children = (__bridge NSArray *)childrenValue;
    NSMutableArray *childNodes = [NSMutableArray array];
    for (NSInteger index = 0; index < (NSInteger)children.count && *nodeCount < maxNodes; index++) {
        AXUIElementRef child = (__bridge AXUIElementRef)children[index];
        NSString *childPath = [NSString stringWithFormat:@"%@.%ld", path, (long)index];
        NSMutableDictionary *childNode = ys_build_ax_node(child, pid, childPath, depth + 1, maxDepth, maxNodes, nodeCount, redactSensitive);
        if (childNode != nil) {
            [childNodes addObject:childNode];
        }
    }
    CFRelease(childrenValue);
    node[@"children"] = childNodes;
    return node;
}

static AXUIElementRef ys_resolve_ax_element_from_id(const char *element_id, pid_t *pidOut) {
    if (element_id == NULL) {
        return NULL;
    }
    NSString *identifier = [NSString stringWithUTF8String:element_id];
    if (![identifier hasPrefix:@"ax_"]) {
        return NULL;
    }
    NSRange separatorRange = [identifier rangeOfString:@"_" options:0 range:NSMakeRange(3, identifier.length - 3)];
    if (separatorRange.location == NSNotFound) {
        return NULL;
    }
    NSString *pidPart = [identifier substringWithRange:NSMakeRange(3, separatorRange.location - 3)];
    NSString *pathPart = [identifier substringFromIndex:separatorRange.location + 1];
    pid_t pid = (pid_t)[pidPart intValue];
    if (pidOut != NULL) {
        *pidOut = pid;
    }
    AXUIElementRef current = AXUIElementCreateApplication(pid);
    NSArray<NSString *> *segments = [pathPart componentsSeparatedByString:@"."];
    for (NSInteger index = 1; index < (NSInteger)segments.count; index++) {
        NSInteger childIndex = [segments[index] integerValue];
        AXUIElementRef child = ys_copy_child_at_index(current, childIndex);
        CFRelease(current);
        if (child == NULL) {
            return NULL;
        }
        current = child;
    }
    return current;
}

static AXUIElementRef ys_copy_window_element(pid_t pid, CGWindowID windowID) {
    CFStringRef windowNumberAttribute = CFSTR("AXWindowNumber");
    AXUIElementRef app = AXUIElementCreateApplication(pid);
    if (app == NULL) {
        return NULL;
    }
    CFTypeRef windowsValue = NULL;
    if (AXUIElementCopyAttributeValue(app, kAXWindowsAttribute, &windowsValue) != kAXErrorSuccess || windowsValue == NULL) {
        CFRelease(app);
        return NULL;
    }
    NSArray *windows = (__bridge NSArray *)windowsValue;
    AXUIElementRef result = NULL;
    for (id entry in windows) {
        AXUIElementRef window = (__bridge AXUIElementRef)entry;
        CFTypeRef windowNumber = NULL;
        if (AXUIElementCopyAttributeValue(window, windowNumberAttribute, &windowNumber) == kAXErrorSuccess && windowNumber != NULL) {
            if ([(__bridge NSNumber *)windowNumber unsignedIntValue] == windowID) {
                result = window;
                CFRetain(result);
                CFRelease(windowNumber);
                break;
            }
            CFRelease(windowNumber);
        }
    }
    CFRelease(windowsValue);
    CFRelease(app);
    return result;
}

static CGEventFlags ys_modifier_flags(int flags) {
    CGEventFlags result = 0;
    if ((flags & 1) != 0) { result |= kCGEventFlagMaskCommand; }
    if ((flags & 2) != 0) { result |= kCGEventFlagMaskControl; }
    if ((flags & 4) != 0) { result |= kCGEventFlagMaskAlternate; }
    if ((flags & 8) != 0) { result |= kCGEventFlagMaskShift; }
    return result;
}

static CGKeyCode ys_key_code(NSString *key) {
    NSDictionary<NSString *, NSNumber *> *mapping = @{
        @"a": @0, @"s": @1, @"d": @2, @"f": @3, @"h": @4, @"g": @5,
        @"z": @6, @"x": @7, @"c": @8, @"v": @9, @"b": @11, @"q": @12,
        @"w": @13, @"e": @14, @"r": @15, @"y": @16, @"t": @17, @"1": @18,
        @"2": @19, @"3": @20, @"4": @21, @"6": @22, @"5": @23, @"=": @24,
        @"9": @25, @"7": @26, @"-": @27, @"8": @28, @"0": @29, @"]": @30,
        @"o": @31, @"u": @32, @"[": @33, @"i": @34, @"p": @35, @"l": @37,
        @"j": @38, @"'": @39, @"k": @40, @";": @41, @"\\": @42, @",": @43,
        @"/": @44, @"n": @45, @"m": @46, @".": @47, @"tab": @48, @"space": @49,
        @"enter": @36, @"return": @36, @"escape": @53, @"esc": @53, @"delete": @51,
        @"backspace": @51, @"left": @123, @"right": @124, @"down": @125, @"up": @126
    };
    NSNumber *value = mapping[[key lowercaseString]];
    return value != nil ? (CGKeyCode)[value unsignedShortValue] : UINT16_MAX;
}

static NSBitmapImageRep *ys_bitmap_rep_from_image(CGImageRef imageRef) {
    if (imageRef == NULL) {
        return nil;
    }
    NSImage *image = [[NSImage alloc] initWithCGImage:imageRef size:NSZeroSize];
    return [[NSBitmapImageRep alloc] initWithData:[image TIFFRepresentation]];
}

static NSBitmapImageRep *ys_resize_bitmap_rep(NSBitmapImageRep *source, int maxWidth, int maxHeight) {
    if (source == nil || maxWidth <= 0 || maxHeight <= 0) {
        return source;
    }
    int sourceWidth = (int)source.pixelsWide;
    int sourceHeight = (int)source.pixelsHigh;
    if (sourceWidth <= maxWidth && sourceHeight <= maxHeight) {
        return source;
    }
    CGFloat widthRatio = (CGFloat)maxWidth / (CGFloat)sourceWidth;
    CGFloat heightRatio = (CGFloat)maxHeight / (CGFloat)sourceHeight;
    CGFloat scale = MIN(widthRatio, heightRatio);
    NSInteger targetWidth = MAX(1, (NSInteger)floor(sourceWidth * scale));
    NSInteger targetHeight = MAX(1, (NSInteger)floor(sourceHeight * scale));

    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(targetWidth, targetHeight)];
    [image lockFocus];
    [[NSGraphicsContext currentContext] setImageInterpolation:NSImageInterpolationHigh];
    [source drawInRect:NSMakeRect(0, 0, targetWidth, targetHeight)];
    [image unlockFocus];

    return [[NSBitmapImageRep alloc] initWithData:[image TIFFRepresentation]];
}

static NSDictionary *ys_capture_result(NSBitmapImageRep *bitmap, NSString *format) {
    if (bitmap == nil) {
        return nil;
    }
    NSBitmapImageFileType fileType = NSBitmapImageFileTypePNG;
    NSString *mimeType = @"image/png";
    if ([[format lowercaseString] isEqualToString:@"jpeg"] || [[format lowercaseString] isEqualToString:@"jpg"]) {
        fileType = NSBitmapImageFileTypeJPEG;
        mimeType = @"image/jpeg";
    }
    NSData *data = [bitmap representationUsingType:fileType properties:@{}];
    if (data == nil) {
        return nil;
    }
    return @{
        @"mimeType": mimeType,
        @"width": @(bitmap.pixelsWide),
        @"height": @(bitmap.pixelsHigh),
        @"scaleFactor": @1,
        @"dataBase64": [data base64EncodedStringWithOptions:0],
    };
}

static SCShareableContent *ys_shareable_content(void) {
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block SCShareableContent *content = nil;
    [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *shareableContent, NSError *error) {
        if (error == nil) {
            content = shareableContent;
        }
        dispatch_semaphore_signal(semaphore);
    }];
    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
    return content;
}

static CGImageRef ys_capture_image(SCContentFilter *filter, CGRect sourceRect) {
    if (filter == nil) {
        return NULL;
    }
    SCStreamConfiguration *configuration = [SCStreamConfiguration new];
    if (!CGRectIsEmpty(sourceRect)) {
        configuration.sourceRect = sourceRect;
        configuration.width = sourceRect.size.width;
        configuration.height = sourceRect.size.height;
    }
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block CGImageRef capturedImage = NULL;
    [SCScreenshotManager captureImageWithFilter:filter configuration:configuration completionHandler:^(CGImageRef image, NSError *error) {
        if (error == nil && image != NULL) {
            capturedImage = CGImageRetain(image);
        }
        dispatch_semaphore_signal(semaphore);
    }];
    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
    return capturedImage;
}

void ys_free_string(char *value) {
    free(value);
}

char *ys_list_displays_json(void) {
    NSMutableArray *result = [NSMutableArray array];
    NSArray<NSScreen *> *screens = [NSScreen screens];
    NSScreen *mainScreen = [NSScreen mainScreen];
    for (NSScreen *screen in screens) {
        NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
        CGRect frame = screen.frame;
        NSMutableDictionary *entry = [NSMutableDictionary dictionary];
        entry[@"nativeId"] = screenNumber ?: @0;
        entry[@"name"] = screen.localizedName ?: @"";
        entry[@"bounds"] = @{
            @"x": @(frame.origin.x),
            @"y": @(frame.origin.y),
            @"width": @(frame.size.width),
            @"height": @(frame.size.height),
        };
        entry[@"scaleFactor"] = @(screen.backingScaleFactor);
        entry[@"primary"] = @([screen isEqual:mainScreen]);
        [result addObject:entry];
    }
    return ys_json_string(result);
}

char *ys_list_applications_json(void) {
    NSMutableArray *result = [NSMutableArray array];
    NSArray<NSRunningApplication *> *applications = [[NSWorkspace sharedWorkspace] runningApplications];
    for (NSRunningApplication *application in applications) {
        if (application.activationPolicy == NSApplicationActivationPolicyProhibited) {
            continue;
        }
        NSMutableDictionary *entry = [NSMutableDictionary dictionary];
        entry[@"nativeId"] = @(application.processIdentifier);
        entry[@"pid"] = @(application.processIdentifier);
        entry[@"bundleId"] = application.bundleIdentifier ?: @"";
        entry[@"name"] = application.localizedName ?: @"";
        entry[@"frontmost"] = @(application.active);
        [result addObject:entry];
    }
    return ys_json_string(result);
}

char *ys_list_windows_json(void) {
    NSMutableArray *result = [NSMutableArray array];
    NSRunningApplication *frontmost = [[NSWorkspace sharedWorkspace] frontmostApplication];
    pid_t frontmostPID = frontmost != nil ? frontmost.processIdentifier : 0;
    CFArrayRef windows = CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID);
    if (windows == NULL) {
        return ys_json_string(result);
    }
    for (NSDictionary *window in (__bridge NSArray *)windows) {
        NSNumber *windowNumber = window[(id)kCGWindowNumber];
        NSNumber *ownerPID = window[(id)kCGWindowOwnerPID];
        NSDictionary *bounds = window[(id)kCGWindowBounds];
        if (windowNumber == nil || ownerPID == nil || bounds == nil) {
            continue;
        }
        NSMutableDictionary *entry = [NSMutableDictionary dictionary];
        entry[@"nativeId"] = windowNumber;
        entry[@"pid"] = ownerPID;
        entry[@"application"] = window[(id)kCGWindowOwnerName] ?: @"";
        entry[@"title"] = window[(id)kCGWindowName] ?: @"";
        entry[@"layer"] = window[(id)kCGWindowLayer] ?: @0;
        entry[@"visible"] = window[(id)kCGWindowIsOnscreen] ?: @NO;
        entry[@"frontmost"] = @([ownerPID intValue] == frontmostPID);
        entry[@"bounds"] = @{
            @"x": bounds[@"X"] ?: @0,
            @"y": bounds[@"Y"] ?: @0,
            @"width": bounds[@"Width"] ?: @0,
            @"height": bounds[@"Height"] ?: @0,
        };
        [result addObject:entry];
    }
    CFRelease(windows);
    return ys_json_string(result);
}

char *ys_capture_display_json(unsigned int display_id, double x, double y, double width, double height, int has_region, int max_width, int max_height, const char *format) {
    SCShareableContent *content = ys_shareable_content();
    SCDisplay *targetDisplay = nil;
    for (SCDisplay *display in content.displays) {
        if (display.displayID == (CGDirectDisplayID)display_id) {
            targetDisplay = display;
            break;
        }
    }
    if (targetDisplay == nil) {
        return NULL;
    }
    SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingWindows:@[]];
    CGRect rect = CGRectNull;
    if (has_region != 0) {
        rect = CGRectMake(x, y, width, height);
    }
    CGImageRef imageRef = ys_capture_image(filter, rect);
    if (imageRef == NULL) {
        return NULL;
    }
    NSBitmapImageRep *bitmap = ys_bitmap_rep_from_image(imageRef);
    CGImageRelease(imageRef);
    bitmap = ys_resize_bitmap_rep(bitmap, max_width, max_height);
    NSString *formatString = format != NULL ? [NSString stringWithUTF8String:format] : @"png";
    return ys_json_string(ys_capture_result(bitmap, formatString));
}

char *ys_capture_window_json(unsigned int window_id, int max_width, int max_height, const char *format) {
    SCShareableContent *content = ys_shareable_content();
    SCWindow *targetWindow = nil;
    for (SCWindow *window in content.windows) {
        if (window.windowID == (CGWindowID)window_id) {
            targetWindow = window;
            break;
        }
    }
    if (targetWindow == nil) {
        return NULL;
    }
    SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:targetWindow];
    CGImageRef imageRef = ys_capture_image(filter, CGRectNull);
    if (imageRef == NULL) {
        return NULL;
    }
    NSBitmapImageRep *bitmap = ys_bitmap_rep_from_image(imageRef);
    CGImageRelease(imageRef);
    bitmap = ys_resize_bitmap_rep(bitmap, max_width, max_height);
    NSString *formatString = format != NULL ? [NSString stringWithUTF8String:format] : @"png";
    return ys_json_string(ys_capture_result(bitmap, formatString));
}

char *ys_get_ax_tree_json(int pid, int max_depth, int max_nodes, int redact_sensitive) {
    AXUIElementRef app = AXUIElementCreateApplication(pid);
    if (app == NULL) {
        return NULL;
    }
    int nodeCount = 0;
    NSMutableDictionary *node = ys_build_ax_node(app, pid, @"0", 0, max_depth, max_nodes, &nodeCount, redact_sensitive != 0);
    CFRelease(app);
    return ys_json_string(node);
}

bool ys_perform_ax_action(const char *element_id, const char *action, const char *value) {
    if (action == NULL) {
        return false;
    }
    pid_t pid = 0;
    AXUIElementRef element = ys_resolve_ax_element_from_id(element_id, &pid);
    if (element == NULL) {
        return false;
    }
    NSString *actionName = [NSString stringWithUTF8String:action];
    BOOL success = NO;
    if ([actionName isEqualToString:@"press"]) {
        success = AXUIElementPerformAction(element, kAXPressAction) == kAXErrorSuccess;
    } else if ([actionName isEqualToString:@"confirm"]) {
        success = AXUIElementPerformAction(element, kAXConfirmAction) == kAXErrorSuccess;
    } else if ([actionName isEqualToString:@"cancel"]) {
        success = AXUIElementPerformAction(element, kAXCancelAction) == kAXErrorSuccess;
    } else if ([actionName isEqualToString:@"raise"]) {
        success = AXUIElementPerformAction(element, kAXRaiseAction) == kAXErrorSuccess;
    } else if ([actionName isEqualToString:@"focus"]) {
        success = AXUIElementSetAttributeValue(element, kAXFocusedAttribute, kCFBooleanTrue) == kAXErrorSuccess;
    } else if ([actionName isEqualToString:@"setValue"]) {
        NSString *stringValue = value != NULL ? [NSString stringWithUTF8String:value] : @"";
        success = AXUIElementSetAttributeValue(element, kAXValueAttribute, (__bridge CFTypeRef)stringValue) == kAXErrorSuccess;
    }
    CFRelease(element);
    return success;
}

bool ys_focus_window(unsigned int window_id) {
    CFArrayRef windows = CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, (CGWindowID)window_id);
    if (windows == NULL) {
        return false;
    }
    NSArray *entries = (__bridge NSArray *)windows;
    if (entries.count == 0) {
        CFRelease(windows);
        return false;
    }
    NSDictionary *entry = entries[0];
    pid_t pid = [entry[(id)kCGWindowOwnerPID] intValue];
    AXUIElementRef window = ys_copy_window_element(pid, (CGWindowID)window_id);
    if (window == NULL) {
        CFRelease(windows);
        return false;
    }
    BOOL raised = AXUIElementPerformAction(window, kAXRaiseAction) == kAXErrorSuccess;
    BOOL focused = AXUIElementSetAttributeValue(window, kAXMainAttribute, kCFBooleanTrue) == kAXErrorSuccess;
    CFRelease(window);
    CFRelease(windows);
    return raised || focused;
}

bool ys_launch_application(const char *bundle_id) {
    if (bundle_id == NULL) {
        return false;
    }
    NSString *bundleIdentifier = [NSString stringWithUTF8String:bundle_id];
    return [[NSWorkspace sharedWorkspace] launchAppWithBundleIdentifier:bundleIdentifier options:NSWorkspaceLaunchDefault additionalEventParamDescriptor:nil launchIdentifier:nil];
}

char *ys_read_clipboard_json(void) {
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    NSString *text = [pasteboard stringForType:NSPasteboardTypeString];
    if (text != nil) {
        return ys_json_string(@{ @"text": text, @"hasText": @YES, @"type": @"text/plain" });
    }
    return ys_json_string(@{ @"hasText": @NO, @"type": @"unknown" });
}

bool ys_write_clipboard_text(const char *text) {
    if (text == NULL) {
        return false;
    }
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    [pasteboard clearContents];
    NSString *value = [NSString stringWithUTF8String:text];
    return [pasteboard setString:value forType:NSPasteboardTypeString];
}

bool ys_clear_clipboard(void) {
    [[NSPasteboard generalPasteboard] clearContents];
    return true;
}

bool ys_move_pointer(double x, double y) {
    CGEventRef event = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, CGPointMake(x, y), kCGMouseButtonLeft);
    if (event == NULL) {
        return false;
    }
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
    return true;
}

bool ys_mouse_click(double x, double y, int button, int count) {
    CGMouseButton mouseButton = button == 1 ? kCGMouseButtonRight : kCGMouseButtonLeft;
    CGEventType downType = mouseButton == kCGMouseButtonRight ? kCGEventRightMouseDown : kCGEventLeftMouseDown;
    CGEventType upType = mouseButton == kCGMouseButtonRight ? kCGEventRightMouseUp : kCGEventLeftMouseUp;
    for (int i = 0; i < MAX(count, 1); i++) {
        CGEventRef down = CGEventCreateMouseEvent(NULL, downType, CGPointMake(x, y), mouseButton);
        CGEventRef up = CGEventCreateMouseEvent(NULL, upType, CGPointMake(x, y), mouseButton);
        if (down == NULL || up == NULL) {
            if (down != NULL) { CFRelease(down); }
            if (up != NULL) { CFRelease(up); }
            return false;
        }
        CGEventSetIntegerValueField(down, kCGMouseEventClickState, i + 1);
        CGEventSetIntegerValueField(up, kCGMouseEventClickState, i + 1);
        CGEventPost(kCGHIDEventTap, down);
        CGEventPost(kCGHIDEventTap, up);
        CFRelease(down);
        CFRelease(up);
    }
    return true;
}

bool ys_mouse_drag(double from_x, double from_y, double to_x, double to_y) {
    CGEventRef down = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, CGPointMake(from_x, from_y), kCGMouseButtonLeft);
    CGEventRef drag = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDragged, CGPointMake(to_x, to_y), kCGMouseButtonLeft);
    CGEventRef up = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, CGPointMake(to_x, to_y), kCGMouseButtonLeft);
    if (down == NULL || drag == NULL || up == NULL) {
        if (down != NULL) { CFRelease(down); }
        if (drag != NULL) { CFRelease(drag); }
        if (up != NULL) { CFRelease(up); }
        return false;
    }
    CGEventPost(kCGHIDEventTap, down);
    CGEventPost(kCGHIDEventTap, drag);
    CGEventPost(kCGHIDEventTap, up);
    CFRelease(down);
    CFRelease(drag);
    CFRelease(up);
    return true;
}

bool ys_scroll_wheel(double x, double y, int delta_x, int delta_y) {
    (void)x;
    (void)y;
    CGEventRef event = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitLine, 2, delta_y, delta_x);
    if (event == NULL) {
        return false;
    }
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
    return true;
}

bool ys_type_text(const char *text) {
    if (text == NULL) {
        return false;
    }
    NSString *stringValue = [NSString stringWithUTF8String:text];
    NSUInteger length = [stringValue length];
    UniChar chars[length];
    [stringValue getCharacters:chars range:NSMakeRange(0, length)];
    CGEventRef down = CGEventCreateKeyboardEvent(NULL, 0, true);
    CGEventRef up = CGEventCreateKeyboardEvent(NULL, 0, false);
    if (down == NULL || up == NULL) {
        if (down != NULL) { CFRelease(down); }
        if (up != NULL) { CFRelease(up); }
        return false;
    }
    CGEventKeyboardSetUnicodeString(down, length, chars);
    CGEventKeyboardSetUnicodeString(up, length, chars);
    CGEventPost(kCGHIDEventTap, down);
    CGEventPost(kCGHIDEventTap, up);
    CFRelease(down);
    CFRelease(up);
    return true;
}

bool ys_send_key(const char *key, int flags, int key_down, int key_up) {
    if (key == NULL) {
        return false;
    }
    NSString *keyValue = [NSString stringWithUTF8String:key];
    CGKeyCode keyCode = ys_key_code(keyValue);
    if (keyCode == UINT16_MAX) {
        return false;
    }
    CGEventFlags eventFlags = ys_modifier_flags(flags);
    if (key_down != 0) {
        CGEventRef down = CGEventCreateKeyboardEvent(NULL, keyCode, true);
        if (down == NULL) { return false; }
        CGEventSetFlags(down, eventFlags);
        CGEventPost(kCGHIDEventTap, down);
        CFRelease(down);
    }
    if (key_up != 0) {
        CGEventRef up = CGEventCreateKeyboardEvent(NULL, keyCode, false);
        if (up == NULL) { return false; }
        CGEventSetFlags(up, eventFlags);
        CGEventPost(kCGHIDEventTap, up);
        CFRelease(up);
    }
    return true;
}

bool ys_focused_element_is_sensitive(void) {
    NSRunningApplication *frontmost = [[NSWorkspace sharedWorkspace] frontmostApplication];
    if (frontmost == nil) {
        return false;
    }
    AXUIElementRef app = AXUIElementCreateApplication(frontmost.processIdentifier);
    if (app == NULL) {
        return false;
    }
    CFTypeRef focusedValue = NULL;
    BOOL sensitive = NO;
    if (AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute, &focusedValue) == kAXErrorSuccess && focusedValue != NULL) {
        AXUIElementRef focusedElement = (AXUIElementRef)focusedValue;
        CFTypeRef roleValue = NULL;
        CFTypeRef subroleValue = NULL;
        AXUIElementCopyAttributeValue(focusedElement, kAXRoleAttribute, &roleValue);
        AXUIElementCopyAttributeValue(focusedElement, kAXSubroleAttribute, &subroleValue);
        sensitive = ys_element_is_sensitive(ys_cfstring_value(roleValue), ys_cfstring_value(subroleValue));
        if (roleValue != NULL) { CFRelease(roleValue); }
        if (subroleValue != NULL) { CFRelease(subroleValue); }
        CFRelease(focusedValue);
    }
    CFRelease(app);
    return sensitive;
}

bool ys_ax_is_trusted(void) {
    return AXIsProcessTrusted();
}

bool ys_preflight_screen_capture(void) {
    if (@available(macOS 11.0, *)) {
        return CGPreflightScreenCaptureAccess();
    }
    return true;
}

static NSString *ys_permission_anchor(const char *permission) {
    if (permission == NULL) {
        return nil;
    }
    NSString *value = [NSString stringWithUTF8String:permission];
    if ([value isEqualToString:@"accessibility"]) {
        return @"Privacy_Accessibility";
    }
    if ([value isEqualToString:@"screenRecording"]) {
        return @"Privacy_ScreenCapture";
    }
    if ([value isEqualToString:@"camera"]) {
        return @"Privacy_Camera";
    }
    if ([value isEqualToString:@"fullDiskAccess"]) {
        return @"Privacy_AllFiles";
    }
    if ([value isEqualToString:@"localNetwork"]) {
        return @"Privacy_LocalNetwork";
    }
    if ([value isEqualToString:@"inputMonitoring"]) {
        return @"Privacy_ListenEvent";
    }
    if ([value isEqualToString:@"automation"]) {
        return @"Privacy_Automation";
    }
    if ([value isEqualToString:@"bluetooth"]) {
        return @"Privacy_Bluetooth";
    }
    return nil;
}

bool ys_open_permission_settings(const char *permission) {
    NSString *anchor = ys_permission_anchor(permission);
    if (anchor == nil) {
        return false;
    }
    NSString *urlString = [@"x-apple.systempreferences:com.apple.preference.security?" stringByAppendingString:anchor];
    NSURL *url = [NSURL URLWithString:urlString];
    if (url == nil) {
        return false;
    }
    return [[NSWorkspace sharedWorkspace] openURL:url];
}
