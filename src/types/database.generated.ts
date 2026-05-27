export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      quiz_definition_snapshots: {
        Row: {
          created_at: string
          definition: Json
          definition_version: number
          id: string
          quiz_id: string
        }
        Insert: {
          created_at?: string
          definition: Json
          definition_version: number
          id?: string
          quiz_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          definition_version?: number
          id?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_definition_snapshots_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_invitations: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          expires_at: string | null
          id: string
          invitation_key: string
          label: string
          max_uses: number | null
          quiz_id: string
          result_sharing_mode: Database["public"]["Enums"]["result_sharing_mode"]
          revoked_at: string | null
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          expires_at?: string | null
          id?: string
          invitation_key: string
          label?: string
          max_uses?: number | null
          quiz_id: string
          result_sharing_mode?: Database["public"]["Enums"]["result_sharing_mode"]
          revoked_at?: string | null
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          expires_at?: string | null
          id?: string
          invitation_key?: string
          label?: string
          max_uses?: number | null
          quiz_id?: string
          result_sharing_mode?: Database["public"]["Enums"]["result_sharing_mode"]
          revoked_at?: string | null
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_invitations_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_response_answers: {
        Row: {
          answer_id: string | null
          answer_value: Json | null
          answered_at: string
          deleted_at: string | null
          id: string
          question_id: string
          response_id: string
          revision: number
          updated_at: string
        }
        Insert: {
          answer_id?: string | null
          answer_value?: Json | null
          answered_at?: string
          deleted_at?: string | null
          id?: string
          question_id: string
          response_id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          answer_id?: string | null
          answer_value?: Json | null
          answered_at?: string
          deleted_at?: string | null
          id?: string
          question_id?: string
          response_id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_response_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "quiz_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_response_view_keys: {
        Row: {
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          invitation_id: string | null
          label: string
          last_viewed_at: string | null
          notes: string
          response_id: string
          revoked_at: string | null
          updated_at: string
          view_key: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          invitation_id?: string | null
          label?: string
          last_viewed_at?: string | null
          notes?: string
          response_id: string
          revoked_at?: string | null
          updated_at?: string
          view_key: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          invitation_id?: string | null
          label?: string
          last_viewed_at?: string | null
          notes?: string
          response_id?: string
          revoked_at?: string | null
          updated_at?: string
          view_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_response_view_keys_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "quiz_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_response_view_keys_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "quiz_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_responses: {
        Row: {
          current_question_id: string | null
          deleted_at: string | null
          id: string
          last_seen_at: string
          quiz_id: string
          respondent_label: string
          response_key_digest: string
          revoked_at: string | null
          snapshot_id: string
          started_at: string
          state: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          current_question_id?: string | null
          deleted_at?: string | null
          id?: string
          last_seen_at?: string
          quiz_id: string
          respondent_label?: string
          response_key_digest: string
          revoked_at?: string | null
          snapshot_id: string
          started_at?: string
          state?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          current_question_id?: string | null
          deleted_at?: string | null
          id?: string
          last_seen_at?: string
          quiz_id?: string
          respondent_label?: string
          response_key_digest?: string
          revoked_at?: string | null
          snapshot_id?: string
          started_at?: string
          state?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_responses_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_responses_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "quiz_definition_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          admin_key_digest: string
          created_at: string
          current_definition: Json
          current_definition_version: number
          deleted_at: string | null
          description: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_key_digest: string
          created_at?: string
          current_definition: Json
          current_definition_version?: number
          deleted_at?: string | null
          description?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_key_digest?: string
          created_at?: string
          current_definition?: Json
          current_definition_version?: number
          deleted_at?: string | null
          description?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      result_sharing_mode: "off" | "opt_in" | "opt_out" | "mandatory"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      result_sharing_mode: ["off", "opt_in", "opt_out", "mandatory"],
    },
  },
} as const

