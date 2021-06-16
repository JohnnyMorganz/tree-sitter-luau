const PREC = {
  PRIORTIY: 1,

  OR: 2,
  AND: 3,
  COMPARE: 4,
  CONCAT: 5,
  ADD: 6,
  MULTI: 7,
  UNARY: 8,
  POWER: 9,

  TYPE_UNION: 2,
  TYPE_INTERSECTION: 3,
  TYPE_OPTIONAL: 4,
  TYPE_GENERIC: 5, // Priority in comparison to less than expression checking - x :: number<Foo as the beginning of a generic type, rather than (x :: number) < Foo
  TYPE_ASSERTION: 10,
};

module.exports = grammar({
  name: "luau",

  // External scanners to handle complex rules
  externals: ($) => [$._multiline_comment, $.string],

  // Tokens which can appear anywhere in the language.
  extras: ($) => [/[\r\n]/, /\s/, $.comment],

  inline: ($) => [$.prefix, $.type_info, $.return_type_specifier],

  conflicts: ($) => [
    [$._expression, $.function_call],
    [$.type_parentheses, $.type_callback_argument],
    [$.type_tuple, $.type_callback_argument],
  ],

  rules: {
    program: ($) => $._block,

    _statement: ($) =>
      choice(
        $.variable_assignment,
        $.function_call,
        $.do_statement,
        $.while_statement,
        $.repeat_statement,
        $.if_statement,
        $.numeric_for_statement,
        $.generic_for_statement,
        $.function_declaration,
        $.local_function_declaration,
        $.local_assignment,
        $.compound_assignment,
        $.type_declaration
      ),

    _last_statement: ($) =>
      choice($.return_statement, $.break_statement, $.continue_statement),

    _chunk: ($) =>
      choice(
        seq(
          repeat1(seq($._statement, optional(";"))),
          optional(seq($._last_statement, optional(";")))
        ),
        $._last_statement
      ),

    _block: ($) => $._chunk,

    // Statements
    variable_assignment: ($) =>
      seq(
        list_of(field("variable", $.variable_declarator), ",", false),
        "=",
        list_of(field("expression", $._expression), ",", false)
      ),

    do_statement: ($) =>
      seq(
        alias("do", $.do_token),
        field("block", optional($._block)),
        $.end_token
      ),

    while_statement: ($) =>
      seq(
        alias("while", $.while_token),
        field("condition", $._expression),
        alias("do", $.do_token),
        field("block", optional($._block)),
        $.end_token
      ),

    repeat_statement: ($) =>
      seq(
        alias("repeat", $.repeat_token),
        field("block", optional($._block)),
        alias("until", $.until_token),
        field("condition", $._expression)
      ),

    if_statement: ($) =>
      seq(
        alias("if", $.if_token),
        field("condition", $._expression),
        alias("then", $.then_token),
        field("block", optional($._block)),
        repeat($.else_if_statement),
        optional($.else_statement),
        $.end_token
      ),
    else_if_statement: ($) =>
      seq(
        alias("elseif", $.else_if_token),
        field("condition", $._expression),
        alias("then", $.then_token),
        field("block", optional($._block))
      ),
    else_statement: ($) =>
      seq(alias("else", $.else_token), field("block", optional($._block))),

    numeric_for_statement: ($) =>
      seq(
        "for",
        field("var", alias($.local_variable_declarator, $.variable_declarator)),
        "=",
        field("start", $._expression),
        ",",
        field("end", $._expression),
        optional(seq(",", field("step", $._expression))),
        "do",
        field("block", optional($._block)),
        $.end_token
      ),

    generic_for_statement: ($) =>
      seq(
        "for",
        field(
          "names",
          list_of(
            alias($.local_variable_declarator, $.variable_declarator),
            ",",
            false
          )
        ),
        "in",
        field("expressions", list_of($._expression, ",", false)),
        "do",
        optional($._block),
        $.end_token
      ),

    function_declaration: ($) =>
      seq(
        alias("function", $.function_token),
        field("name", $.function_name),
        field("generics", optional($.generics_declaration)),
        $._function_body
      ),

    function_name: ($) =>
      seq(
        list_of($.identifier, alias(".", $.table_dot), false),
        optional(seq(alias(":", $.table_colon), $.identifier))
      ),

    local_function_declaration: ($) =>
      seq(
        $.local_token,
        alias("function", $.function_token),
        field("name", $.identifier),
        field("generics", optional($.generics_declaration)),
        $._function_body
      ),

    local_assignment: ($) =>
      seq(
        $.local_token,
        list_of(
          field(
            "name",
            alias($.local_variable_declarator, $.variable_declarator)
          ),
          ",",
          false
        ),
        optional(
          seq("=", list_of(field("expression", $._expression), ",", false))
        )
      ),

    compound_assignment: ($) =>
      seq(
        field("variable", $._var),
        $._compound_op,
        field("expression", $._expression)
      ),

    return_statement: ($) =>
      seq("return", optional(list_of($._expression, ","))),

    break_statement: ($) => "break",
    continue_statement: ($) => "continue",

    // Building blocks
    _var: ($) =>
      choice(
        $.identifier,
        seq($.prefix, "[", $._expression, "]"),
        seq($.prefix, ".", $.identifier)
      ),

    prefix: ($) =>
      choice(
        $._var,
        prec(-1, $.function_call),
        seq($.left_paren, $._expression, $.right_paren)
      ),

    variable_declarator: ($) => $._var,
    local_variable_declarator: ($) =>
      seq(
        field("name", $.identifier),
        field("type_specifier", optional($.type_specifier))
      ),

    // Expressions
    _expression: ($) =>
      choice(
        $.nil,
        $.boolean,
        $.number,
        $.string,
        $.ellipse,
        $.anonymous_function,
        $.prefix,
        $.table_constructor,
        $.binary_expression,
        $.unary_expression,
        $.type_assertion
      ),

    anonymous_function: ($) => seq("function", $._function_body),
    _function_body: ($) =>
      seq(
        $.left_paren,
        field("parameters", optional($.parameter_list)),
        $.right_paren,
        field("return_type", optional($.return_type_specifier)),
        field("block", alias(optional($._block), $.function_block)),
        $.end_token
      ),

    parameter_list: ($) =>
      choice(
        seq(
          list_of($.parameter, ",", false),
          optional(seq(",", alias($._parameter_ellipse, $.parameter)))
        ),
        alias($._parameter_ellipse, $.parameter)
      ),

    parameter: ($) =>
      seq(
        field("parameter", $.identifier),
        field("type_specifier", optional($.type_specifier))
      ),
    _parameter_ellipse: ($) => seq($.ellipse, optional($.type_specifier)),

    // Table
    table_constructor: ($) =>
      seq("{", field("fields", optional($.table_fields)), "}"),
    table_fields: ($) => list_of($.field, $._field_separator, true),
    _named_field_expression: ($) =>
      seq(field("name", $.identifier), "=", field("value", $._expression)),
    _expression_field_expression: ($) =>
      seq(
        "[",
        field("key", $._expression),
        "]",
        "=",
        field("value", $._expression)
      ),

    field: ($) =>
      choice(
        $._named_field_expression,
        $._expression_field_expression,
        field("value", $._expression)
      ),
    _field_separator: ($) => choice(",", ";"),

    // Function Call
    function_call: ($) =>
      prec.dynamic(
        PREC.PRIORTIY,
        seq($.prefix, choice($._args, $._method_call))
      ),

    _method_call: ($) => seq(":", $.identifier, $._args),
    _args: ($) =>
      choice(
        seq(
          $.left_paren,
          field("args", optional($.function_arguments)),
          $.right_paren
        ),
        field("args", $.table_constructor),
        field("args", $.string)
      ),
    function_arguments: ($) => list_of($._expression, ",", false),

    binary_expression: ($) =>
      choice(
        ...[
          ["or", PREC.OR],
          ["and", PREC.AND],
          ["<", PREC.COMPARE],
          ["<=", PREC.COMPARE],
          ["==", PREC.COMPARE],
          ["~=", PREC.COMPARE],
          [">=", PREC.COMPARE],
          [">", PREC.COMPARE],
          ["+", PREC.ADD],
          ["-", PREC.ADD],
          ["*", PREC.MULTI],
          ["/", PREC.MULTI],
          ["%", PREC.MULTI],
        ].map(([operator, precedence]) =>
          prec.left(precedence, seq($._expression, operator, $._expression))
        ),
        ...[
          ["..", PREC.CONCAT],
          ["^", PREC.POWER],
        ].map(([operator, precedence]) =>
          prec.right(precedence, seq($._expression, operator, $._expression))
        )
      ),

    unary_expression: ($) =>
      prec.left(PREC.UNARY, seq(choice("not", "#", "-"), $._expression)),

    // Primitives
    number: ($) => {
      const decimal_digits = seq(/[0-9_]+/);
      const signed_integer = seq(optional(choice("-", "+")), decimal_digits);
      const decimal_exponent = seq(choice("e", "E"), signed_integer);

      const decimal_integer_literal = choice(
        "0",
        seq(optional("0"), /[1-9]/, optional(decimal_digits))
      );

      const decimal_literal = choice(
        seq(
          decimal_integer_literal,
          ".",
          optional(decimal_digits),
          optional(decimal_exponent)
        ),
        seq(".", decimal_digits, optional(decimal_exponent)),
        seq(decimal_integer_literal, optional(decimal_exponent))
      );

      const hex_digits = /[a-fA-F0-9_]+/;
      const hex_literal = seq(choice("0x", "0X"), hex_digits);

      const binary_digits = /[0-1_]+/;
      const binary_literal = seq(choice("0b", "0B"), binary_digits);

      return token(choice(decimal_literal, hex_literal, binary_literal));
    },

    ellipse: ($) => "...",

    nil: ($) => "nil",
    boolean: ($) => choice("true", "false"),
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    left_paren: ($) => "(",
    right_paren: ($) => ")",

    local_token: ($) => "local",
    end_token: ($) => "end",

    _compound_op: ($) => choice("+=", "-=", "*=", "/=", "%=", "^=", "..="),

    // Type Annotations
    type_declaration: ($) =>
      seq(
        optional(alias("export", $.export_token)),
        alias("type", $.type_token),
        field("name", $.identifier),
        field("generics", optional($.generics_declaration)),
        "=",
        field("type", $.type_info)
      ),

    generics_declaration: ($) =>
      seq("<", list_of($.identifier, ",", false), ">"),

    type_assertion: ($) =>
      prec.left(PREC.TYPE_ASSERTION, seq($._expression, "::", $.type_info)),
    type_specifier: ($) => seq(":", field("type", $.type_info)),
    return_type_specifier: ($) => seq(":", field("type", $.return_type)),

    type_info: ($) =>
      choice(
        $.identifier,
        $.type_array,
        $.type_callback,
        $.type_generic,
        $.type_module,
        $.type_parentheses,
        $.type_table,
        $.type_typeof,
        $.type_union,
        $.type_intersection,
        $.type_optional
      ),
    type_array: ($) => seq("{", $.type_info, "}"),
    type_callback: ($) =>
      seq(
        "(",
        optional(list_of($.type_callback_argument, ",", false)),
        ")",
        "->",
        $.return_type
      ),
    type_callback_argument: ($) =>
      seq(
        optional(seq($.identifier, ":")),
        choice($.type_variadic, $.type_info)
      ),
    type_generic: ($) =>
      prec.left(
        PREC.TYPE_GENERIC,
        seq($.identifier, "<", list_of($.type_info, ",", false), ">")
      ),
    type_module: ($) =>
      prec.left(
        PREC.TYPE_GENERIC,
        seq(
          $.identifier,
          ".",
          $.identifier,
          optional(seq("<", list_of($.type_info, ",", false), ">"))
        )
      ),
    type_parentheses: ($) => seq("(", $.type_info, ")"),
    type_table: ($) =>
      seq("{", list_of($.type_table_field, $._field_separator, false), "}"),
    type_table_field: ($) =>
      seq(choice($.identifier, seq("[", $.type_info, "]")), ":", $.type_info),
    type_tuple: ($) =>
      choice(
        seq("(", ")"),
        seq("(", $.type_info, ",", list_of($.type_info, ",", false), ")")
      ),
    type_typeof: ($) => seq("typeof", "(", $._expression, ")"),
    type_variadic: ($) => seq(alias($.ellipse, "..."), $.type_info),
    type_union: ($) =>
      prec.left(PREC.TYPE_UNION, seq($.type_info, "|", $.type_info)),
    type_intersection: ($) =>
      prec.left(PREC.TYPE_INTERSECTION, seq($.type_info, "&", $.type_info)),
    type_optional: ($) => prec(PREC.TYPE_OPTIONAL, seq($.type_info, "?")),
    return_type: ($) => choice($.type_tuple, $.type_variadic, $.type_info),

    // Comments
    comment: ($) => choice(seq("--", /.*\r?\n/), $._multiline_comment),
  },
});

function list_of(match, sep, trailing) {
  return trailing
    ? seq(match, repeat(seq(sep, match)), optional(sep))
    : seq(match, repeat(seq(sep, match)));
}
