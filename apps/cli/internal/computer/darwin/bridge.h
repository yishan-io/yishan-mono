#pragma once

#include <stdbool.h>

char *ys_list_displays_json(void);
char *ys_list_applications_json(void);
char *ys_list_windows_json(void);
char *ys_capture_display_json(unsigned int display_id, double x, double y, double width, double height, int has_region, int max_width, int max_height, const char *format);
char *ys_capture_window_json(unsigned int window_id, int max_width, int max_height, const char *format);
char *ys_get_ax_tree_json(int pid, int max_depth, int max_nodes, int redact_sensitive);
bool ys_perform_ax_action(const char *element_id, const char *action, const char *value);
bool ys_focus_window(unsigned int window_id);
bool ys_launch_application(const char *bundle_id);
char *ys_read_clipboard_json(void);
bool ys_write_clipboard_text(const char *text);
bool ys_clear_clipboard(void);
bool ys_move_pointer(double x, double y);
bool ys_mouse_click(double x, double y, int button, int count);
bool ys_mouse_drag(double from_x, double from_y, double to_x, double to_y);
bool ys_scroll_wheel(double x, double y, int delta_x, int delta_y);
bool ys_type_text(const char *text);
bool ys_send_key(const char *key, int flags, int key_down, int key_up);
bool ys_focused_element_is_sensitive(void);
void ys_free_string(char *value);

bool ys_ax_is_trusted(void);
bool ys_preflight_screen_capture(void);
bool ys_open_permission_settings(const char *permission);
